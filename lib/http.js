"use strict";
/*
 * Copyright (c) 2011 Vinay Pulim <vinay@milewise.com>
 * MIT Licensed
 */
var __rest = (this && this.__rest) || function (s, e) {
    var t = {};
    for (var p in s) if (Object.prototype.hasOwnProperty.call(s, p) && e.indexOf(p) < 0)
        t[p] = s[p];
    if (s != null && typeof Object.getOwnPropertySymbols === "function")
        for (var i = 0, p = Object.getOwnPropertySymbols(s); i < p.length; i++) {
            if (e.indexOf(p[i]) < 0 && Object.prototype.propertyIsEnumerable.call(s, p[i]))
                t[p[i]] = s[p[i]];
        }
    return t;
};
exports.__esModule = true;
exports.HttpClient = void 0;
var debugBuilder = require("debug");
var httpNtlm = require("httpntlm");
var req = require("request");
var url = require("url");
var uuid_1 = require("uuid");
var debug = debugBuilder('node-soap');
var VERSION = require('../package.json').version;
/**
 * A class representing the http client
 * @param {Object} [options] Options object. It allows the customization of
 * `request` module
 *
 * @constructor
 */
var HttpClient = /** @class */ (function () {
    function HttpClient(options) {
        options = options || {};
        this._request = options.request || req;
    }
    /**
     * Build the HTTP request (method, uri, headers, ...)
     * @param {String} rurl The resource url
     * @param {Object|String} data The payload
     * @param {Object} exheaders Extra http headers
     * @param {Object} exoptions Extra options
     * @returns {Object} The http request object for the `request` module
     */
    HttpClient.prototype.buildRequest = function (rurl, data, exheaders, exoptions) {
        if (exoptions === void 0) { exoptions = {}; }
        var curl = url.parse(rurl);
        var secure = curl.protocol === 'https:';
        var host = curl.hostname;
        var port = parseInt(curl.port, 10);
        var path = [curl.pathname || '/', curl.search || '', curl.hash || ''].join('');
        var method = data ? 'POST' : 'GET';
        var headers = {
            'User-Agent': 'node-soap/' + VERSION,
            'Accept': 'text/html,application/xhtml+xml,application/xml,text/xml;q=0.9,*/*;q=0.8',
            'Accept-Encoding': 'none',
            'Accept-Charset': 'utf-8',
            'Connection': exoptions.forever ? 'keep-alive' : 'close',
            'Host': host + (isNaN(port) ? '' : ':' + port)
        };
        var mergeOptions = ['headers'];
        var _attachments = exoptions.attachments, newExoptions = __rest(exoptions, ["attachments"]);
        var attachments = _attachments || [];
        if (typeof data === 'string' && attachments.length === 0 && !exoptions.forceMTOM) {
            headers['Content-Length'] = Buffer.byteLength(data, 'utf8');
            headers['Content-Type'] = 'application/x-www-form-urlencoded';
        }
        exheaders = exheaders || {};
        for (var attr in exheaders) {
            headers[attr] = exheaders[attr];
        }
        var options = {
            uri: curl,
            method: method,
            headers: headers,
            followAllRedirects: true
        };
        if (exoptions.forceMTOM || attachments.length > 0) {
            var start = uuid_1.v4();
            var action = null;
            if (headers['Content-Type'].indexOf('action') > -1) {
                for (var _i = 0, _a = headers['Content-Type'].split('; '); _i < _a.length; _i++) {
                    var ct = _a[_i];
                    if (ct.indexOf('action') > -1) {
                        action = ct;
                    }
                }
            }
            headers['Content-Type'] =
                'multipart/related; type="application/xop+xml"; start="<' + start + '>"; start-info="text/xml"; boundary=' + uuid_1.v4();
            if (action) {
                headers['Content-Type'] = headers['Content-Type'] + '; ' + action;
            }
            var multipart_1 = [{
                    'Content-Type': 'application/xop+xml; charset=UTF-8; type="text/xml"',
                    'Content-ID': '<' + start + '>',
                    'body': data
                }];
            attachments.forEach(function (attachment) {
                multipart_1.push({
                    'Content-Type': attachment.mimetype,
                    'Content-Transfer-Encoding': 'binary',
                    'Content-ID': '<' + attachment.contentId + '>',
                    'Content-Disposition': 'attachment; filename="' + attachment.name + '"',
                    'body': attachment.body
                });
            });
            options.multipart = multipart_1;
        }
        else {
            options.body = data;
        }
        for (var attr in newExoptions) {
            if (mergeOptions.indexOf(attr) !== -1) {
                for (var header in exoptions[attr]) {
                    options[attr][header] = exoptions[attr][header];
                }
            }
            else {
                options[attr] = exoptions[attr];
            }
        }
        debug('Http request: %j', options);
        return options;
    };
    /**
     * Handle the http response
     * @param {Object} The req object
     * @param {Object} res The res object
     * @param {Object} body The http body
     * @param {Object} The parsed body
     */
    HttpClient.prototype.handleResponse = function (req, res, body) {
        debug('Http response body: %j', body);
        if (typeof body === 'string') {
            // Remove any extra characters that appear before or after the SOAP
            // envelope.
            var match = body.replace(/<!--[\s\S]*?-->/, '').match(/(?:<\?[^?]*\?>[\s]*)?<([^:]*):Envelope([\S\s]*)<\/\1:Envelope>/i);
            if (match) {
                body = match[0];
            }
        }
        return body;
    };
    HttpClient.prototype.request = function (rurl, data, callback, exheaders, exoptions, caller) {
        var _this = this;
        var options = this.buildRequest(rurl, data, exheaders, exoptions);
        var req;
        if (exoptions !== undefined && exoptions.hasOwnProperty('ntlm')) {
            // sadly when using ntlm nothing to return
            // Not sure if this can be handled in a cleaner way rather than an if/else,
            // will to tidy up if I get chance later, patches welcome - insanityinside
            // TODO - should the following be uri?
            options.url = rurl;
            httpNtlm[options.method.toLowerCase()](options, function (err, res) {
                if (err) {
                    return callback(err);
                }
                // if result is stream
                if (typeof res.body !== 'string') {
                    res.body = res.body.toString();
                }
                res.body = _this.handleResponse(req, res, res.body);
                callback(null, res, res.body);
            });
        }
        else {
            req = this._request(options, function (err, res, body) {
                if (err) {
                    return callback(err);
                }
                body = _this.handleResponse(req, res, body);
                callback(null, res, body);
            });
        }
        return req;
    };
    HttpClient.prototype.requestStream = function (rurl, data, exheaders, exoptions, caller) {
        var options = this.buildRequest(rurl, data, exheaders, exoptions);
        return this._request(options);
    };
    return HttpClient;
}());
exports.HttpClient = HttpClient;
//# sourceMappingURL=http.js.map