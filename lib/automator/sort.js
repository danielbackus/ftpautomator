'use strict';

/**
 * @function sortIntoBatches A function for sorting an array of files into batch objects
 * @param {Object[]} files An array of file objects returned by ssh2-sftp-client's list function
 * @return {Object[][]} An array of arrays of files, representing batches
 */
module.exports = function sortIntoBatches(files) {
	// sort the files by modify date ascending
	files.sort((a, b) => a.modifyTime - b.modifyTime);

	let batches = [];
	let currentBatch = [];

	// sort files into batches
	for (let i = 0; i < files.length; i++) {
		let currentFile = files[i];
		currentBatch.push(currentFile);
		if (i + 2 > files.length) {
			batches.push(currentBatch);
			break;
		}
		let nextFile = files[i + 1];
		if (nextFile.modifyTime > currentFile.modifyTime + 5 * 60 * 1000) {
			batches.push(currentBatch);
			currentBatch = [];
		}
	}

	return batches;
};
