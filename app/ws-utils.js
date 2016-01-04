/**
 * Copyright (c) Jupyter Development Team.
 * Distributed under the terms of the Modified BSD License.
 */

// Adapted from [code](http://stackoverflow.com/a/10402443) written by
// [Richard Astbury](http://stackoverflow.com/users/349014), based on general algorithm by
// [pimvdb](http://stackoverflow.com/users/514749).
// Licensed under [cc by-sa 3.0](http://creativecommons.org/licenses/by-sa/3.0/)

/**
 * Encodes one or more WebSocket messages.
 * @param  {Array} data - array of message objects of the form:
 *                            {
 *                                [masks: array of WebSocket message mask octets,]
 *                                payload: decoded message string
 *                            }
 * @return {Buffer} encoded messages
 */
function encodeWebSocket(data) {
    data = [].concat(data || []); // ensure an array
    var bytesFormatted = [];

    // each message will be pushed into the buffer
    for (var i = 0; i < data.length; i++) {
        var d = data[i];
        var masks = d.masks;
        var bytesRaw = d.payload;
        var masked = masks ? 128 : 0;

        // Step 1: encode data type and mask bit
        bytesFormatted.push(129);

        // Step 2: encode data length
        if (bytesRaw.length <= 125) {
            bytesFormatted.push(bytesRaw.length + masked);
        } else if (bytesRaw.length >= 126 && bytesRaw.length <= 65535) {
            bytesFormatted.push(126 + masked,
                                ( bytesRaw.length / Math.pow(2, 8) ) & 255,
                                ( bytesRaw.length                  ) & 255);
        } else {
            bytesFormatted.push(127 + masked,
                                ( bytesRaw.length / Math.pow(2, 56) ) & 255,
                                ( bytesRaw.length / Math.pow(2, 48) ) & 255,
                                ( bytesRaw.length / Math.pow(2, 40) ) & 255,
                                ( bytesRaw.length / Math.pow(2, 32) ) & 255,
                                ( bytesRaw.length / Math.pow(2, 24) ) & 255,
                                ( bytesRaw.length / Math.pow(2, 16) ) & 255,
                                ( bytesRaw.length / Math.pow(2,  8) ) & 255,
                                ( bytesRaw.length                   ) & 255);
        }

        // Step 3: encode mask if necessary
        if (masks) {
            for (var j = 0; j < masks.length; j++) {
                bytesFormatted.push(masks[j]);
            }
        }

        // Step 4: encode data
        var code;
        for (var k = 0; k < bytesRaw.length; k++) {
            code = bytesRaw.charCodeAt(k);
            if (masks) {
                code = code ^ masks[k % 4];
            }
            bytesFormatted.push(code);
        }
    }

    return new Buffer(bytesFormatted);
}

/**
 * Decodes Buffer data into one or more text WebSocket messages.
 * @param  {Buffer} data - raw buffer of one or more WebSocket messages
 * @return {Array} array of objects of the form:
 *                    {
 *                        masks: array of WebSocket message mask octets (null if not masked),
 *                        payload: decoded message string
 *                    }
 */
function decodeWebSocket(data) {
    var start = 0, end = 0, decodedData = [];

    while (end < data.length) {
        // determine message length and mask start
        var datalength = data[start + 1] & 127;
        var dataIdx = start + 2;

        // compute length based on extra bytes
        if (datalength === 126) { // 2 extra bytes
            dataIdx = start + 4;
            datalength = (data[start + 2] * Math.pow(2, 8)) +
                          data[start + 3];
        } else if (datalength === 127) { // 8 extra bytes
            dataIdx = start + 10;
            datalength = (data[start + 2] * Math.pow(2, 56)) +
                         (data[start + 3] * Math.pow(2, 48)) +
                         (data[start + 4] * Math.pow(2, 40)) +
                         (data[start + 5] * Math.pow(2, 32)) +
                         (data[start + 6] * Math.pow(2, 24)) +
                         (data[start + 7] * Math.pow(2, 16)) +
                         (data[start + 8] * Math.pow(2,  8)) +
                          data[start + 9];
        }

        // get mask if present
        var isMasked = !!(data[start + 1] & 128);
        var masks = [0,0,0,0];
        if (isMasked) {
            masks = data.slice(dataIdx, dataIdx += 4);
        }

        // compute the end of the message
        end = datalength + dataIdx;

        // decode message data if text
        if (data[start] === 129) {
            var dataIdxRel = 0;
            var output = '';
            while (dataIdx < end) {
                output += String.fromCharCode(data[dataIdx++] ^ masks[dataIdxRel++ % 4]);
            }

            decodedData.push({
                masks: isMasked ? masks : null,
                payload: output
            });
        }

        // set start of next message in the buffer
        start = end;
    }

    return decodedData;
}

module.exports = {
    encodeWebSocket: encodeWebSocket,
    decodeWebSocket: decodeWebSocket
};
