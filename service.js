'use strict';

const Service = require('node-windows').Service;
const path = require('path');

// create new Service object
const svc = new Service({
	name: 'FTP Batch Processing Service',
	description: 'Service for daily process of PDF/TIF file batches',
	script: path.normalize(__dirname + '/index.js')
});

// listen for the install event, which signals the service is available
svc.on('install', () => {
	// start the service once ready
	svc.start();
});

// install the service
svc.install();
