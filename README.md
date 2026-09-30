# Data Quality Configuration Helper Tool

> ![Maturity: Validated](https://img.shields.io/badge/maturity-Validated-yellow)  
> Intended use: configure data quality metrics as DHIS2 metadata (predictors, data elements, indicators)
> Maintainers: HISP Centre implementation team.
>
> **WARNING**
> This tool is intended to be used by system administrators to perform specific tasks, it is not intended for end users. It is available as a DHIS2 app, but has not been through the same rigorous testing as normal core apps. It should be used with care, and always tested in a development environment.

**Note**: this tool is in a prototype stage, and should be used with care in test/development systems only.

The Data Quality Configuration Helper Tool is designed to streamline the configuration and management of data quality settings within DHIS2. It provides users with easy-to-use interfaces for managing validation rules, indicators, and data integrity checks, aimed at enhancing the reliability and accuracy of data in health information systems.

The app is built on the [DHIS2 App Platform](https://developers.dhis2.org/docs/app-platform/getting-started/) (React, `@dhis2/ui`, `@dhis2/app-runtime`) and supports DHIS2 2.41 and later.

## License

© Copyright University of Oslo 2024

## Getting started

### Install dependencies

```
pnpm install
```

### Start dev server

```
pnpm start --proxy https://your-dhis2-instance.example.org
```

The dev server starts on http://localhost:3000 with a proxy that handles
authentication against the target DHIS2 instance.

### Compile to zip

To compile the app to a `.zip` file that can be installed in DHIS2
(**App Management** → **Manual install**):

```
pnpm run build
```

The installable archive is written to `build/bundle/tool-dq-helper-<version>.zip`.

### Lint and format

```
pnpm run lint
pnpm run format
```
