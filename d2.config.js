/** @type {import('@dhis2/cli-app-scripts').D2Config} */
const config = {
    type: 'app',
    name: 'tool-dq-helper',
    title: 'DQ Metrics Configuration Tool',
    description:
        'Tool for system administrators to configure data quality metrics metadata (outliers, consistency, completeness).',
    minDHIS2Version: '2.41',

    author: {
        name: 'HISP Centre',
        email: 'dev@dhis2.org',
        url: 'https://dhis2.org',
    },

    entryPoints: {
        app: './src/App.tsx',
    },

    viteConfigExtensions: './viteConfigExtensions.mts',
}

module.exports = config
