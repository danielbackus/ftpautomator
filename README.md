### How do I get set up? ###

In order to deploy this to a development or production server, you will have to:

1. Clone the repo

2. `npm install`

3. Create a .env file to house the following environment variables:

* FTP_HOST
    * SFTP server address
* FTP_USER
    * Username credential
* FTP_PASSWORD
    * Password credential
* FTP_SOURCE_FOLDER
    * Base SFTP folder where input folders are contained
* FTP_DEST_FOLDER
    * Base SFTP folder where output folders are contained
* FTP_FOLDERS_TO_PROCESS
    * Full paths of subfolders to process, comma-separated.
* SENDGRID_API_KEY
    * A valid API key for SendGrid, used to send email notifications
* EMAIL_FROM
    * The email address to be used as the sender for email notifications
* EMAIL_TO
    * Email addresses to receive email notifications, comma-separated.
* EMAIL_CC
    * Email addresses to be cc'd on email notifications, comma-separated.
* PRODUCTION_PATH
    * UNC path to which production files will be posted.

### Unit tests ###

Unit tests can be run via `npm test` and require [ava](https://github.com/avajs/ava).

### Running the process as a one-off ###

This process can be run manually with `npm start`

### Installing the daily automated service

You can install this service to run automatically at 10 PM EST weekdays by running `node service.js`