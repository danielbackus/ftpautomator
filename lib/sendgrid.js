require('dotenv').config();
const sg = require('sendgrid')(process.env.SENDGRID_API_KEY);
const helper = require('sendgrid').mail;
const fs = require('fs-extra');

const sender = new helper.Email(process.env.EMAIL_FROM);
const personalization = new helper.Personalization();
const recipients = process.env.EMAIL_TO.split(',');
const ccs = process.env.EMAIL_CC.split(',');
for (let to of recipients) {
	personalization.addTo(new helper.Email(to));
}
for (let cc of ccs) {
	personalization.addCc(new helper.Email(cc));
}

sg.sendMail = async (subject, html) => {
	const content = new helper.Content('text/html', html);
	const mail = new helper.Mail();
	mail.setFrom(sender);
	mail.setSubject(subject);
	mail.addContent(content);
	mail.addPersonalization(personalization);

	const request = sg.emptyRequest({
		method: 'POST',
		path: '/v3/mail/send',
		body: mail.toJSON()
	});

	await sg.API(request);
};

module.exports = sg;
