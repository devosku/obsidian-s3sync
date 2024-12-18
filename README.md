# Obsidian S3Sync Plugin

Obsidian plugin for synchronizing to Amazon S3.

## How to use

- Clone this repo to the Obsidian plugin directory.
- Make sure your NodeJS is at least v22 (`node --version`).
- `npm i` or `yarn` to install dependencies.
- `npm run dev` to start compilation in watch mode.
- Enable the plugin in Obsidian.

# How to run tests

Running the tests requires docker and docker compose to be installed. The tests
are ran in docker because we are using Localstack to simulate a S3 bucket.

```
docker compose run --rm testrunner npm run test
```

Alternatively for example if you need to keep the instance running between test
runs you can first spin up the docker compose on background and the execute
the tests inside the testrunner container:

```
docker compose up -d
docker compose exec testrunner /bin/bash
npm run test
```

To shutdown the containers run if you started them with the `up -d`:

```
docker compose down
```

## Releasing new releases

- Update `manifest.json` with new version number, such as `1.0.1`, and the minimum Obsidian version required for your latest release.
- Update `versions.json` file with `"new-plugin-version": "minimum-obsidian-version"` so older versions of Obsidian can download an older version of your plugin that's compatible.
- Create new GitHub release using your new version number as the "Tag version". Use the exact version number, don't include a prefix `v`. See here for an example: https://github.com/obsidianmd/obsidian-sample-plugin/releases
- Upload the files `manifest.json`, `main.js`, `styles.css` as binary attachments. Note: The manifest.json file must be in two places, first the root path of your repository and also in the release.
- Publish the release.

> You can simplify the version bump process by running `npm version patch`, `npm version minor` or `npm version major` after updating `minAppVersion` manually in `manifest.json`.
> The command will bump version in `manifest.json` and `package.json`, and add the entry for the new version to `versions.json`


## API Documentation

TODO

## Synchronizing algorithm

TODO

### When does a file need to be synchronized

TODO

### How does the plugin solve the conflict?