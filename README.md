# Obsidian S3Sync Plugin

## How to use

- Clone this repo.
- Make sure your NodeJS is at least v22 (`node --version`).
- `npm i` or `yarn` to install dependencies.
- `npm run dev` to start compilation in watch mode.

# How to run tests

Running the tests requires docker and docker compose to be installed. The tests
are ran in docker because we are using Localstack to simulate a S3 bucket.

```
docker compose run --rm testrunner npm run test
```

## Releasing new releases

- Update your `manifest.json` with your new version number, such as `1.0.1`, and the minimum Obsidian version required for your latest release.
- Update your `versions.json` file with `"new-plugin-version": "minimum-obsidian-version"` so older versions of Obsidian can download an older version of your plugin that's compatible.
- Create new GitHub release using your new version number as the "Tag version". Use the exact version number, don't include a prefix `v`. See here for an example: https://github.com/obsidianmd/obsidian-sample-plugin/releases
- Upload the files `manifest.json`, `main.js`, `styles.css` as binary attachments. Note: The manifest.json file must be in two places, first the root path of your repository and also in the release.
- Publish the release.

> You can simplify the version bump process by running `npm version patch`, `npm version minor` or `npm version major` after updating `minAppVersion` manually in `manifest.json`.
> The command will bump version in `manifest.json` and `package.json`, and add the entry for the new version to `versions.json`


## API Documentation

TODO


## Synchronizing algorithm

Every time synchronization happens all files from the vault are inserted to 
SQLite database that has a table for files. The database contains information
about the files that existed during last synchronization and the current
synchronization.

### When does a file need to be synchronized

When we have the local and remote files in the database we can query to delete
all the data in the database we first delete the entrie 

### How does the plugin solve the conflict?