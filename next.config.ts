import type { NextConfig } from 'next';
const config:NextConfig={serverExternalPackages:['juice','sanitize-html','cheerio'],turbopack:{root:process.cwd()},outputFileTracingExcludes:{'*':['./vendor/**/*','./artifacts/**/*']}};
export default config;
