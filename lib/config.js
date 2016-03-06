'use strict';

const path = require('path');
const Config = {};

Config.ROOT = path.resolve(`${__dirname}/..`);

Config.DEFAULT_EBOOK_FOLDER = `${Config.ROOT}/ebooks`;
Config.DEFAULT_COVER_PATH = `${Config.ROOT}/lib/cover.png`;
Config.KINDLEGEN = `${Config.ROOT}/bin/kindlegen-${process.platform}`;

module.exports = Config;