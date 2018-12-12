require('dotenv').config();
process.env.ROOT_DIRECTORY = __dirname;

const path = require('path');
const fs = require('fs-extra');
const sort = require('./lib/automator/sort.js');
const Batch = require('./lib/automator/Batch.js');
const Client = require('ssh2-sftp-client');
const winston = require('winston');
winston.add(winston.transports.File, { filename: process.env.LOG_FILE, json: false });
const folders = process.env.FTP_FOLDERS_TO_PROCESS.split(',');

let sftp = new Client();
const options = {
	host: process.env.FTP_HOST,
	username: process.env.FTP_USER,
	password: process.env.FTP_PASSWORD
};

module.exports.run = async function () {
	winston.info('emptying wip directory...');
	await fs.emptyDir(path.normalize(__dirname + '/./wip'));
	winston.info('beginning batch processing at ' + new Date());
	await sftp.connect(options);
	for (let folder of folders) {
		winston.info('processing folder: ' + folder);
		let files = await sftp.list(folder);
		winston.info('found ' + files.length + ' files...');
		const batches = sort(files);
		winston.info('sorted files into ' + batches.length + ' batches...');
		for (let files of batches) {
			let options = {
				sftp: sftp,
				folder: folder,
				files: files
			};
			let batch = new Batch(options);
			winston.info('downloading batch...');
			await batch.download();
			winston.info('merging batch...');
			await batch.merge();
			winston.info('verifying batch...');
			await batch.verify();
			if (!batch.errors.length) {
				winston.info('No errors.');
				winston.info('Uploading batch...');
				await batch.upload();
				winston.info('Sending report...');
				await batch.report();
				winston.info('Archiving batch');
				let archiveDir = __dirname + '/archive';
				await batch.archive(archiveDir);
				winston.info('Archived.');
				winston.info('Cleaning up FTP server.');
				await batch.cleanup();
				winston.info('Cleanup done.');
			} else {
				for (let error of batch.errors) {
					winston.info('ERROR: ' + JSON.stringify(error));
				}
				winston.info('Batch has errors. Aborting...');
			}
			winston.info('Batch complete.');
		}
		winston.info('folder complete.');
	}
	winston.info('FTP automation process complete.');
};
