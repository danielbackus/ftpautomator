/**
 * @function populateTemplate this function replaces all placeholder text from template with the corresponding property of the data object
 
 * @param {string} template template string containing placeholders to be populated with data
 * @param {Object} data an object containing key-value pairs to populate the placeholders
 * @param {Object} [userOptions] an optional options object
 * @param {string} [userOptions.openTag={{] the opening tag to designate a placeholder
 * @param {string} [userOptions.closeTag=}}] the closing tag to designate a placeholder
 * @param {boolean} [userOptions.throwErrorOnMissingKey=false] toggle to throw error if a key in the data object is not found in the input string
 */
module.exports = function populateTemplate(template, data, userOptions) {
	// option defaults in case options arg is not provided or malformed
	const defaults = {
		openTag: '{{',
		closeTag: '}}',
		throwErrorOnMissingKey: false
	};
	const options = Object.assign(defaults, userOptions);

	// regex to find the entire placeholders and another for just the decorations
	const placeholders = new RegExp(
		options.openTag + ' *(\\w+\\.*)+\\w+ *' + options.closeTag,
		'g'
	);
	const decorations = new RegExp(options.openTag + '|' + options.closeTag, 'g');

	// do the work of replacing all each {{key}} with the corresponding value from data[key]
	let output = template.replace(placeholders, key => {
		key = key.replace(decorations, '');
		// ensure handle nested keys are handled correctly
		let val = data;
		const split = key.split('.');
		split.forEach(layer => {
			val = val[layer];
		});
		if (options.throwErrorOnMissingKey && !val) {
			// optionally, explode & throw error on failure
			throw {
				name: 'KeyNotFound Error',
				message: 'Corresponding key ' +
					key +
					' not found in data for placeholder string'
			};
		} else {
			return val || '';
		}
	});

	return output;
};
