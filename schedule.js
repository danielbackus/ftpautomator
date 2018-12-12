'use strict';

// setup a recurrence every weekday at 10pm
const schedule = require('node-schedule');
const rule = new schedule.RecurrenceRule();
rule.dayOfWeek = [0, new schedule.Range(1, 5)];
rule.hour = 22;
rule.minute = 0;

// schedule the batch process to run every recurrence
const batchProcess = require('./index.js');
schedule.scheduleJob(rule, batchProcess.run);
