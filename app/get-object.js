/**
 * @param  {Object} obj - Object to query
 * @param  {string} prop - Name of property to test.
 *                         May be a '.'-delimited string to check nested objects
 * @return {*} value of object property, or `undefined` if property doesn't exist
 */
module.exports = function(obj, prop) {
    if (obj && typeof prop === 'string') {
        return prop.split('.').reduce(function(prev, curr) {
        	if (prev) {
          		return prev[curr];
            }
            return undefined;
        }, obj);
    }
};
