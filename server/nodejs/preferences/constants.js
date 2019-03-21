function define(name, value) {
    Object.defineProperty(exports, name, {
        value:      value,
        enumerable: true
    });
}

//define("HTTP_PORT", 16601)

define("MAX_SNIPPET_LENGTH", 30);