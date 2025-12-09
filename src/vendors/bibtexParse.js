/* start bibtexParse 0.0.24 */

//Original work by Henrik Muehe (c) 2010
//
//CommonJS port by Mikola Lysenko 2013
//
//Port to Browser lib by ORCID / RCPETERS
//
//Issues:
//no comment handling within strings
//no string concatenation
//no variable values yet

//Grammar implemented here:
//bibtex -> (string | preamble | comment | entry)*
//string -> '@STRING' '{' key_equals_value '}'
//preamble -> '@PREAMBLE' '{' value '}'
//comment -> '@COMMENT' '{' value '}'
//entry -> '@' key '{' key ',' key_value_list '}'
//key_value_list -> key_equals_value (',' key_equals_value)*
//key_equals_value -> key '=' value
//value -> value_quotes | value_braces | key
//value_quotes -> '"' .*? '"' // not quite
//value_braces -> '{' .*? '}' // not quite
export const bibtexParse = function () {

    var bibtexParse = {};

    bibtexParse.toJSON = function (bibtex) {

        var b = bibtexParse.parse(bibtex);

        var json = [];

        b.entries.forEach(function (element) {
            var entry = element;
            entry.citationKey = element.key;
            delete entry.key;

            if (entry.entryTags) {
                // Modified: Do NOT flatten entryTags. Keep structure compatible with App.tsx
                /*
                var entryTags = entry.entryTags;
                for (var key in entryTags) {
                    if (entryTags.hasOwnProperty(key)) {
                        entry[key] = entryTags[key];
                    }
                }
                delete entry.entryTags;
                delete entry.entryType;
                */
                json.push(entry);
            }
        });

        return json;
    }

    /* added search toToParse */
    bibtexParse.toBibtex = function (json, compact) {
        if (compact === undefined) compact = true;
        var out = '';

        var entryMap = {};

        for (var i in json) {
            out += "@" + json[i].entryType;
            out += '{';
            if (json[i].citationKey)
                out += json[i].citationKey + ',';
            if (compact) out += ' ';
            if (!compact) out += '\n';

            for (var j in json[i].entryTags) {
                out += '  ' + j + '= {' + json[i].entryTags[j] + '}';
                if (compact) out += ', ';
                if (!compact) out += ',\n';
            }
            out += '}';
            if (!compact) out += '\n\n';
        }

        return out;

    };

    bibtexParse.parse = function (input) {

        var entries = [];
        var strings = {};
        var pos = 0;

        var input = input.replace(/(\r\n|\n|\r)/gm, "")

        while (pos < input.length) {
            const result = tryConsumeEntry(input);
            if (result) {
                entries.push(result);
            } else {
                pos++;
            }
        }

        function tryConsumeEntry() {
            skipWhitespace();
            if (input[pos] !== '@') {
                return null;
            }
            pos++;

            const entryType = consumeKey();
            skipWhitespace();
            if (input[pos] !== '{') {
                // error or string/preamble/comment
                return null; // Simplified
            }
            pos++;

            skipWhitespace();
            const key = consumeKey();
            skipWhitespace();

            if (input[pos] !== ',') {
                // Should encounter comma
            } else {
                pos++;
            }

            const entryTags = {};

            while (pos < input.length && input[pos] !== '}') {
                skipWhitespace();
                const tagName = consumeKey();
                skipWhitespace();
                if (input[pos] !== '=') {
                    // error
                    return null;
                }
                pos++;
                skipWhitespace();
                const value = consumeValue();

                if (tagName && value) {
                    entryTags[tagName.toLowerCase()] = value;
                }

                skipWhitespace();
                if (input[pos] === ',') {
                    pos++;
                    continue;
                } else if (input[pos] === '}') {
                    break;
                } else {
                    // unexpected char
                    pos++;
                }

            }

            if (input[pos] === '}') {
                pos++;
            }

            return {
                entryType: entryType,
                key: key,
                entryTags: entryTags
            };
        }

        function skipWhitespace() {
            while (pos < input.length && /\s/.test(input[pos])) {
                pos++;
            }
        }

        function consumeKey() {
            var start = pos;
            while (pos < input.length && /[a-zA-Z0-9_\-:\.\/]/.test(input[pos])) {
                pos++;
            }
            return input.substring(start, pos);
        }

        function consumeValue() {
            if (input[pos] === '{') {
                // braces
                return consumeBracedValue();
            } else if (input[pos] === '"') {
                // quotes
                return consumeQuotedValue();
            } else {
                // unquoted key/number
                return consumeKey();
            }
        }

        function consumeBracedValue() {
            pos++; // '{'
            var start = pos;
            var depth = 0;
            while (pos < input.length) {
                if (input[pos] === '{') depth++;
                if (input[pos] === '}') {
                    if (depth === 0) {
                        const val = input.substring(start, pos);
                        pos++;
                        return val;
                    }
                    depth--;
                }
                pos++;
            }
            return input.substring(start, pos);
        }

        function consumeQuotedValue() {
            pos++; // '"'
            var start = pos;
            while (pos < input.length && input[pos] !== '"') {
                pos++;
            }
            const val = input.substring(start, pos);
            pos++;
            return val;
        }

        return {
            entries: entries
        };
    };

    return bibtexParse;
}();

// Backwards compatibility for the original library structure
export default bibtexParse;
