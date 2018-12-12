'use strict';

const moment = require('moment');
const fs = require('fs-extra');
const winston = require('winston');
const path = require('path');
const populate = require(path.normalize(
	process.env.ROOT_DIRECTORY + '/./lib/utilities/populate.js'
));
const sendgrid = require(path.normalize(
	process.env.ROOT_DIRECTORY + '/./lib/sendgrid.js'
));

/**
 * @class Batch 
 * @classdesc A group of print files to be processed together
 */
module.exports = class Batch {
	/**
     * @constructor
     * @param {Object} options An options object
     * @param {Object} options.sftp An instance of ssh2-sftp-client, https://github.com/jyu213/ssh2-sftp-client/
     * @param {string} options.folder An string representing the folder batch files can be found in
     * @param {string[]} options.files An array of filenames to process
     * 
     */
	constructor(options) {
		if (options && options.sftp && options.folder && options.files.length) {
			this.sftp = options.sftp;
			this.sourceFiles = options.files;
			this.type = options.folder.replace(process.env.FTP_SOURCE_FOLDER, '');
			let timestamp = moment(this.sourceFiles[0].modifyTime).format(
				'YYYY-MM-DD_hhmma'
			);
			this.name = this.type + '_' + timestamp;
			this.remotePath = options.folder;
			this.localPath = path.normalize(
				process.env.ROOT_DIRECTORY + '/wip/' + this.name
			);
			this.setupDirectories();
			this.errors = [];
		} else {
			throw new RangeError('Missing or invalid options argument');
		}
	}
	async setupDirectories() {
		// make sure directory structure exists and is empty
		let tasks = [
			fs.emptyDir(this.localPath),
			fs.emptyDir(this.localPath + '/input'),
			fs.emptyDir(this.localPath + '/output')
		];
		await Promise.all(tasks);
	}
	get(sftp, remotePath, localPath) {
		return new Promise((resolve, reject) => {
			sftp.sftp.fastGet(remotePath, localPath, resolve);
		});
	}
	exec(command) {
		return new Promise((resolve, reject) => {
			require('child_process').exec(command, (error, result, something) => {
				resolve(result);
			});
		});
	}
	async download() {
		for (let file of this.sourceFiles) {
			const localFile = this.localPath + '/input/' + file.name;
			const remoteFile = this.remotePath + '/' + file.name;
			await this.get(this.sftp, remoteFile, localFile);
		}
		return this;
	}
	async merge() {
		let args = [];
		const app = path.normalize(
			process.env.ROOT_DIRECTORY + '/lib/automator/utilities/TIFPDFMerger.exe'
		);

		let tasks = [];

		for (let file of this.sourceFiles) {
			let ext = path.extname(file.name);
			if (ext === '.pdf') {
				// for each PDF, look for a corresponding TIF
				let basename = path.normalize(
					this.localPath + '/input/' + path.basename(file.name, ext)
				);
				if (await fs.exists(basename + '.tif')) {
					// run a child process
					args = ['"' + basename + '.pdf"', '"' + basename + '.tif"'];
					let command = '"' + app + '" ' + args[0] + ' ' + args[1];
					await this.exec(command).catch(e => this.errors.push(e));
				} else {
					// copy PDF to output folder
					tasks.push(
						fs.copy(
							this.localPath + '/input/' + file.name,
							this.localPath + '/output/' + file.name
						)
					);
				}
			}
		}

		await Promise.all(tasks);
		return this;
	}
	async verify() {
		// get the input and output pdfs
		const input = await fs.readdir(this.localPath + '/input');
		const inputPdfs = input.filter(file => path.extname(file) === '.pdf');
		const output = await fs.readdir(this.localPath + '/output');
		const outputPdfs = output.filter(file => path.extname(file) === '.pdf');

		// for each input pdf
		for (let pdf of inputPdfs) {
			let output = outputPdfs.find(
				test => path.basename(test) === path.basename(pdf)
			);
			let err;
			// if there's no output, error
			if (!output) {
				err = { message: 'Missing output', reference: pdf };
				this.errors.push(err);
				continue;
			}

			// if output smaller than input, error
			let inputStats = await fs.stat(this.localPath + '/input/' + pdf);
			let inputSize = inputStats.size;
			let outputSize = 0;
			if (output) {
				let outputStats = await fs.stat(this.localPath + '/output/' + output);
				outputSize = outputStats.size;
			}
			if (outputSize < inputSize) {
				err = { message: 'Output is malformed', reference: output };
				this.errors.push(err);
				continue;
			}

			// if tif exists, a merge should have occurred
			// so if input/output filesizes match, error
			let tif = this.localPath + '/input/' + path.basename(pdf) + '.tif';
			if ((await fs.exists(tif)) && inputSize === outputSize) {
				err = {
					message: 'Output === input: expected merge',
					reference: pdf
				};
				this.errors.push(err);
			}
		}
		return this;
	}
	async ensureFTPUpload(localPath, ftpPath, ftpFolder) {
		let file = path.basename(localPath);
		winston.info('Uploading ' + file + ' to FTP...');
		await this.sftp.put(localPath, ftpPath).catch(e => winston.info);
		let ftpFiles = await this.sftp.list(ftpFolder).catch(e => winston.info);
		let uploaded = ftpFiles.find(remote => remote.name === file);
		if (uploaded) {
			winston.info('Upload successful for ' + JSON.stringify(uploaded.name) + ' at ' + moment());
		} else {
			let err = 'Upload failed for ' + JSON.stringify(file) + ' at ' + moment();
			this.errors.push(err);
			winston.error(err);
		}
	}
	async upload() {
		const output = await fs.readdir(this.localPath + '/output');
		let ftpFolder = process.env.FTP_DEST_FOLDER + this.type + '/';

		for (let file of output) {
			// concatenate paths
			let localPath = this.localPath + '/output/' + file;
			let ftpPath = ftpFolder + file;
			let networkPath =
				process.env.PRODUCTION_PATH + '/' + this.name + '/' + file;

			// upload files back to FTP
			await this.ensureFTPUpload(localPath, ftpPath, ftpFolder);

			// upload files to production UNC path
			await fs.copy(localPath, networkPath);
		}
	}
	async report() {
		// count the pages in batch
		const app = path.normalize(
			process.env.ROOT_DIRECTORY + '/lib/automator/utilities/TIFPDFCounter.exe'
		);
		const target = path.normalize(this.localPath + '/output/');
		let command = '"' + app + '" "' + target + '"';
		let pageCount = 0;
		await this.exec(command).then(result => {
			pageCount = result;
		});

		if (!pageCount) {
			winston.warn('No output. Didn\'t send email report.');
		} else {
			// send an email to account manager with details
			// build the data object to populate the email template
			let fileListHtml = '';
			let outputFiles = await fs.readdir(this.localPath + '/output/');
			for (let file of outputFiles) {
				fileListHtml += '<li>&#x274f; <small> ' + file + '</small></li>';
			}
			let data = {
				batchName: this.name,
				productionPath: path.normalize(
					process.env.PRODUCTION_PATH + '\\' + this.name + '\\'
				),
				pageCount: pageCount,
				fileCount: outputFiles.length,
				fileListHtml: fileListHtml
			};

			// build the email
			let template = await fs.readFile(
				path.normalize(
					process.env.ROOT_DIRECTORY + '/./lib/automator/html/report.html'
				)
			);
			template = template.toString();
			let html = populate(template, data);
			// send the email
			await sendgrid.sendMail('FTP Automation Batch - ' + this.name, html);
		}
		return this;
	}
	async archive(archivePath) {
		// copy the batch directory to the archive folder
		let batchDir = this.localPath;
		archivePath = path.normalize(archivePath + '/' + this.name + '/');

		winston.info('archiving batch files for ' + this.name);
		await fs.copy(this.localPath, archivePath);
		winston.info('archive complete for ' + this.name);
	}
	async cleanup() {
		// delete the input files from the FTP site
		let inputFiles = await fs.readdir(this.localPath + '/input');
		winston.info('cleaning up remote folder: ' + this.remotePath);
		let ftpFiles = await this.sftp.list(this.remotePath);
		for (let file of inputFiles) {
			let remoteFile = ftpFiles.find(f => f.name === file);
			let remoteFilePath = this.remotePath + '/' + remoteFile.name;
			winston.info('deleting ' + remoteFilePath);
			await this.sftp.delete(remoteFilePath);
			winston.info('deleted ' + file);
		}
	}
};
