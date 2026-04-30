const { getDefaultConfig } = require('expo/metro-config');
const path = require('path');

const projectRoot = __dirname;
const config = getDefaultConfig(projectRoot);

// Exclude the web app's directory — metro should never traverse into it
config.resolver.blockList = [
  /Qualityassurancewebapp\/.*/,
];

// Explicit project root avoids path-with-spaces resolution issues on Windows
config.projectRoot = projectRoot;
config.watchFolders = [projectRoot];

module.exports = config;
