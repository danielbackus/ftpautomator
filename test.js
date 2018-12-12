'use strict';

process.env.ROOT_DIRECTORY = __dirname;

// configure env variables for testing
require('dotenv').config({ path: './test.env' });

const test = require('ava').test;
const sinon = require('sinon');
const winston = require('winston');
winston.remove(winston.transports.Console);

const sort = require('./lib/automator/sort.js');
const Batch = require('./lib/automator/batch.js');
const path = require('path');
const fs = require('fs-extra');
const sendgrid = require('./lib/sendgrid.js');

test.before(async t => {
	// before running tests
	// load environment variables
	require('dotenv').config();
	// empty work-in-progress directory
	return await fs.emptyDir(path.normalize(path.join(__dirname, '/wip')));
});

test.serial.afterEach(
	// after each serial test
	// empty work-in-progress directory
	// empty archive directory
	async t => {
		await fs.emptyDir(path.normalize(path.join(__dirname, '/wip')));
		const archive = path.normalize(path.join(__dirname, '/test_archive/'));
		if (await fs.exists(archive)) {
			await fs.emptyDir(archive);
			await fs.rmdir(archive);
		}
	}
);

test('sorts files into batches correctly', t => {
	// create dummy files to sort into
	let files = [];
	let time = new Date().getTime();
	let totalBatches = 2;
	let totalBatchFiles = 5;
	for (let j = 0; j < totalBatches; j++) {
		for (let i = 0; i < totalBatchFiles; i++) {
			files.push({ modifyTime: time });
			time += 3 * 1000 * i;
		}
		time += 60 * 60 * 1000;
	}

	// sort batches
	const batchFiles = sort(files);

	// there should be the correct number of batches
	// and each batch should have the current number of files
	t.is(batchFiles.length, totalBatches);
	for (let batch of batchFiles) {
		t.is(batch.length, totalBatchFiles);
	}
});

test('new Batch throws RangeError with invalid parameters', t => {
	// try to create a batch without parameters
	// it should throw a RangeError
	t.throws(() => new Batch(), RangeError);
});

test('new Batch instantiates successfully with valid parameters', t => {
	// create a new batch correctly
	const options = {
		files: [
			{
				name: 'file1.pdf'
			},
			{
				name: 'file2.pdf'
			},
			{
				name: 'file3.pdf'
			}
		],
		folder: 'test',
		sftp: {}
	};

	// it should instantiate
	t.notThrows(() => new Batch(options));
});

test('Batch.download() calls Batch.get() on all files', async t => {
	// create a new batch
	const options = {
		files: [
			{
				name: 'file1.pdf'
			},
			{
				name: 'file2.pdf'
			},
			{
				name: 'file3.pdf'
			}
		],
		folder: 'test',
		sftp: {}
	};
	const batch = new Batch(options);

	// watch the get function and call Batch.download()
	sinon.stub(batch, 'get');
	await batch.download();

	// the get function should have been called three times
	t.is(batch.get.callCount, 3);
});

test.serial.skip(
	'Batch.merge() spawns the child merge process for each PDF/TIF pair',
	async t => {
		// create a new batch
		const options = {
			files: [
				{
					name: 'file1.pdf'
				},
				{
					name: 'file1.tif'
				},
				{
					name: 'file2.pdf'
				},
				{
					name: 'file2.tif'
				}
			],
			folder: 'test',
			sftp: {}
		};
		const batch = new Batch(options);

		// create dummy input files for the batch
		const testPdf = path.normalize(
			path.join(__dirname, '/test/samples/test.pdf')
		);
		const testTif = path.normalize(
			path.join(__dirname, '/test/samples/test.tif')
		);
		for (let file of batch.sourceFiles) {
			if (path.extname(file.name) === '.pdf') {
				await fs.copy(
					testPdf,
					path.join(batch.localPath, '/input/', file.name)
				);
			} else if (path.extname(file.name) === '.tif') {
				await fs.copy(
					testTif,
					path.join(batch.localPath, '/input/', file.name)
				);
			}
		}

		// watch the merge utility executable, run the merge
		const spy = sinon.spy(batch, 'exec');
		await batch.merge();

		// merge utility executable should have been called twice
		// there should be 2 output files
		t.is(spy.callCount, 2);
		const outputFiles = await fs.readdir(
			path.join(batch.localPath, '/output/')
		);
		t.is(outputFiles.length, 2);
	}
);

test.serial.skip(
	'Batch.merge() copies the PDF for each PDF without a TIF',
	async t => {
		// create a batch
		const options = {
			files: [
				{
					name: 'file1.pdf'
				},
				{
					name: 'file2.pdf'
				},
				{
					name: 'file3.pdf'
				}
			],
			folder: 'test',
			sftp: {}
		};
		const batch = new Batch(options);

		// create dummy input files for the batch
		const testPdf = path.normalize(path.join(__dirname , '/test/samples/test.pdf'));
		for (let file of batch.sourceFiles) {
			let filePath = path.normalize(
				path.join(batch.localPath , '/input/' , file.name)
			);
			await fs.copy(testPdf, filePath);
		}

		// watch the merge utility executable, run the merge
		const spy = sinon.spy(batch, 'exec');
		await batch.merge();

		// merge utility executable should never have been run
		// there should be the same number of input and output files
		t.is(spy.callCount, 0);
		const outputFiles = await fs.readdir(path.join(batch.localPath , '/output/'));
		t.is(outputFiles.length, options.files.length);
	}
);

test.serial('verify() correctly catches errors', async t => {
	// create a batch
	const options = {
		files: [
			{
				name: 'file1.pdf'
			},
			{
				name: 'file1.tif'
			},
			{
				name: 'file2.pdf'
			},
			{
				name: 'file3.pdf'
			},
			{
				name: 'file3.tif'
			},
			{
				name: 'file4.pdf'
			}
		],
		folder: 'test',
		sftp: {}
	};
	let batch = new Batch(options);

	// create dummy input files for the batch
	const testPdf = path.normalize(path.join(__dirname , '/test/samples/test.pdf'));
	const testTif = path.normalize(path.join(__dirname , '/test/samples/test.tif'));
	for (let file of batch.sourceFiles) {
		if (path.extname(file.name) === '.pdf') {
			await fs.copy(testPdf, path.join(batch.localPath , '/input/' , file.name));
		} else if (path.extname(file.name) === '.tif') {
			await fs.copy(testTif, path.join(batch.localPath , '/input/' , file.name));
		}
	}

	// run merge on the batch
	await batch.merge();
	const outputFiles = await fs.readdir(path.join(batch.localPath , '/output/'));

	// mess up some output files
	await fs.copy(
		batch.localPath + '/input/file3.pdf',
		batch.localPath + '/output/file3.pdf',
		{ overwrite: true }
	);
	fs.unlinkSync(path.join(batch.localPath , '/output/file4.pdf'));
	await fs.ensureFile(path.join(batch.localPath , '/output/file4.pdf'));

	// run verify()
	batch = await batch.verify();

	// expect the messed up files to appear in errors
	t.is(batch.errors.length, 2);
});

test.serial('upload', async t => {
	// create a batch
	const options = {
		files: [{}],
		folder: 'test',
		sftp: {
			// mock sftp functions
			list: async () => [],
			put: async () => true
		}
	};
	const batch = new Batch(options);

	// create dummy output
	const outputPath = path.join(batch.localPath , '/output/');
	await fs.ensureDir(outputPath);
	const testSize = 3;
	const testPdf = path.normalize(path.join(__dirname , '/test/samples/test.pdf'));
	for (let i = 0; i < testSize; i++) {
		await fs.copy(testPdf, outputPath + 'file' + i + '.pdf');
	}

	// watch the SFTP upload method
	// then test Batch.upload()
	let spy = sinon.spy(batch.sftp, 'put');
	process.env.PRODUCTION_PATH = path.normalize(
		path.join(__dirname , '/wip/production/')
	);
	await batch.upload();
	// sftp.put() should have been called for each file
	t.is(spy.callCount, testSize);
	// and each file should exist in the production path
	const production = await fs.readdir(
		path.join(process.env.PRODUCTION_PATH , '/' , batch.name)
	);
	t.is(production.length, testSize);
});

test.serial.skip('report', async t => {
	// create a batch
	const options = {
		files: [{}],
		folder: 'test',
		sftp: {
			// mock sftp functions
			put: async () => true
		}
	};
	const batch = new Batch(options);

	// create dummy output
	const outputPath = path.join(batch.localPath , '/output/');
	await fs.ensureDir(outputPath);
	const testSize = 3;
	const testPdf = path.normalize(path.join(__dirname , '/test/samples/test.pdf'));
	for (let i = 0; i < testSize; i++) {
		await fs.copy(testPdf, path.join(outputPath , 'file' + i + '.pdf'));
	}

	// stub the sendgrid API method
	// then test Batch.report()
	sinon.stub(sendgrid, 'sendMail');
	await batch.report();

	// sendgrid.sendMail() should have been called
	t.true(sendgrid.sendMail.called);
});

test.serial(
	'archive() successfully copies batch contents to archive folder',
	async t => {
		// create a batch
		const options = {
			files: [{}],
			folder: 'test',
			sftp: {}
		};
		const batch = new Batch(options);

		// create dummy input/output
		const inputPath = path.join(batch.localPath , '/input/');
		const outputPath = path.join(batch.localPath , '/output/');
		const testPdf = path.normalize(path.join(__dirname , '/test/samples/test.pdf'));
		for (let i = 0; i < 3; i++) {
			await fs.copy(testPdf, path.join(inputPath , 'file' + i + '.pdf'));
			await fs.copy(testPdf, path.join(outputPath , 'file' + i + '.pdf'));
		}

		// archive the files
		let testArchiveDir = path.normalize(path.join(__dirname , '/test_archive/'));
		await batch.archive(testArchiveDir);

		// ensure that for each file in the batch input/output, a corresponding archive file exists
		let localPath = {
			input: await fs.readdir(path.join(batch.localPath , '/input')),
			output: await fs.readdir(path.join(batch.localPath , '/output'))
		};
		let archivePath = path.normalize(
			path.join(__dirname , '/test_archive/' , batch.name)
		);
		let archive = {
			input: await fs.readdir(path.join(archivePath , '/input')),
			output: await fs.readdir(path.join(archivePath , '/output'))
		};
		t.true(
			localPath.input.every(file =>
				archive.input.find(f => f === path.basename(file))
			)
		);
		t.true(
			localPath.output.every(file =>
				archive.output.find(f => f === path.basename(file))
			)
		);
	}
);

test.serial('cleanup()', async t => {
	// create a batch
	const options = {
		files: [{}],
		folder: 'test',
		sftp: {
			// mock sftp functions
			list: async () => [
				{ name: 'file0.pdf' },
				{ name: 'file1.pdf' },
				{ name: 'file2.pdf' }
			],
			delete: async () => true
		}
	};
	const batch = new Batch(options);

	// create dummy input
	const inputPath = path.join(batch.localPath , '/input/');
	const testPdf = path.normalize(path.join(__dirname , '/test/samples/test.pdf'));
	for (let i = 0; i < 3; i++) {
		await fs.copy(testPdf, path.join(inputPath , 'file' + i + '.pdf'));
	}

	// cleanup() calls delete on each file
	let spy = sinon.spy(batch.sftp, 'delete');
	await batch.cleanup();
	t.is(spy.callCount, 3);
});
