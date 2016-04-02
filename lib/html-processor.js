'use strict';

const request = require('request').defaults({ gzip: true });
const path = require('path');
const Url = require('url');
const fs = require('fs-extra');
const shortid = require('shortid');

const Config = require('./config');

function limitRequestSize(req, cb) {
    let totalData = 0;
    const error = {
        success: false,
        error: 'File too big.',
    };

    req.on('data', (data) => {
        totalData += data.length;
        if (totalData >= 10000000) {
            req.abort();
            cb(error);
        }
    });
}

class HtmlProcessor {

    static extractImages(rootUrl, html) {
        const cheerio = require('cheerio');
        const $ = cheerio.load(html);
        const sources = HtmlProcessor.getImageSources($);

        const imgMap = {};
        sources.forEach((src) => {
            const absoluteUrl = HtmlProcessor.absolutifyUrl(rootUrl, src);
            imgMap[src] = {
                src,
                absoluteUrl,
                localPath: `${Config.IMAGES_TMP}/${shortid.generate()}`,
            };
        });

        return new Promise((resolve) => {
            HtmlProcessor.downloadImages(imgMap).then((imgStatuses) => {
                const downloadedImages = [];
                $('img').each((index, elem) => {
                    const result = imgStatuses.find((status) => status.src === $(elem).attr('src'));

                    if (result && result.success && result.localPath) {
                        const bookPath = result.localPath.replace(/.*(images\/.*)/, '../$1');
                        $(elem).attr('src', bookPath);
                        downloadedImages.push(result.localPath);
                    } else {
                        $(elem).remove();
                    }
                });

                resolve({
                    html: $.html(),
                    images: downloadedImages,
                });
            }).catch(console.log);
        });
    }

    static getImageSources($) {
        const imgs = [];
        $('img').each((index, elem) => {
            const src = $(elem).attr('src');
            if (src) {
                imgs.push(src);
            }
        });
        return imgs;
    }

    static absolutifyUrl(root, url) {
        const rootParsed = Url.parse(root);
        const parsed = Url.parse(url);
        let absoluteUrl;

        if (parsed.host) {
            absoluteUrl = url;
        } else {
            absoluteUrl = Url.resolve(root, path.resolve(path.dirname(rootParsed.path), url));
        }

        return absoluteUrl;
    }

    static addFiletype(headers, filepath) {
        const FILE_TYPES = {
            'image/png': '.png',
            'image/jpg': '.jpg',
            'image/jpeg': '.jpg',
            'image/gif': '.gif',
            'image/svg+xml': '.svg',
            'image/svg': '.svg',
        };

        if (!path.extname(filepath)) {
            const type = headers['content-type'];
            return filepath + (FILE_TYPES[type] || '');
        }
        return filepath;
    }

    static downloadImages(imgMap) {
        const requestPromises = Object.keys(imgMap).map((imgSrc) => {
            const downloadInfo = imgMap[imgSrc];

            return new Promise((resolve) => {
                const req = request({
                    url: downloadInfo.absoluteUrl,
                    encoding: null,
                }, (error, response, body) => {
                    if (error) {
                        downloadInfo.success = false;
                        downloadInfo.error = error;
                        resolve(downloadInfo);
                    } else {
                        downloadInfo.localPath = HtmlProcessor.addFiletype(
                            response.headers,
                            downloadInfo.localPath
                        );

                        fs.outputFile(downloadInfo.localPath, body, 'binary', (err) => {
                            if (err) {
                                downloadInfo.success = false;
                                downloadInfo.error = err;
                                resolve(downloadInfo);
                            } else {
                                downloadInfo.success = true;
                                resolve(downloadInfo);
                            }
                        });
                    }
                });
                limitRequestSize(req, resolve);
            });
        });

        return Promise.all(requestPromises);
    }

    static cleanTags(html) {
        const cheerio = require('cheerio');
        const $ = cheerio.load(html);

        const tagsToFilter = {
            script: 'remove',
            article: 'replaceWith',
            noscript: 'replaceWith',
            p: 'removeAttrs',
            div: 'removeAttrs',
            img: 'maximizeSize',
        };

        const methods = {
            remove: (selector) => {
                $(selector).each((index, elem) => {
                    $(elem).remove();
                });
            },
            replaceWith: (selector) => {
                $(selector).each((index, elem) => {
                    $(elem).replaceWith($(elem).html());
                });
            },
            removeAttrs: (selector) => {
                const invalidAttrs = ['itemprop', 'property'];
                $(selector).each((index, elem) => {
                    invalidAttrs.forEach((attr) => {
                        $(elem).removeAttr(attr);
                    });
                });
            },
            maximizeSize: (selector) => {
                $(selector).each((index, elem) => {
                    $(elem).attr('height', '');
                    $(elem).attr('width', '100%');
                });
            },
        };

        Object.keys(tagsToFilter).forEach((key) => {
            const method = tagsToFilter[key];
            methods[method](key);
        });

        return $.html();
    }
}

module.exports = HtmlProcessor;