# Obsidian S3Sync Plugin

Obsidian plugin for synchronizing to Amazon S3.

## Why would I need this plugin?

Short answer is that you **probably don't**. This project was created
for my personal usage and there are some more professional alternatives:

- [Obsidian Sync](https://obsidian.md/sync)
    - Official syncing service of Obsidian
- [remotely-save](https://github.com/remotely-save/remotely-save)
    - Plugin that also supports other services than Amazon S3

## Features

- Synchronize your Obsidian vault to Amazon S3

## Usage

To use this plugin you must install the plugin itself and create the required
AWS resources.

### How to install

The plugin is not currently available from the Obsidian community plugins so
you can do one of the following:

1. Install with BRAT
  - First install the [BRAT](https://github.com/TfTHacker/obsidian42-brat)
  plugin from the community plugins
  - Add the https://github.com/devosku/obsidian-s3sync in BRAT settings
2. Install manually
  - Download or clone the plugin to your vaults `.obsidian/plugins` directory

### How to create required AWS resources

There are many ways you can create the required resources, but this guide
describes how to do it with AWS CloudFormation through AWS CLI. Please see
[AWS guide](https://docs.aws.amazon.com/cli/latest/userguide/getting-started-quickstart.html)
if you need help with setting up the AWS CLI.

You can use the following cloudformation template to create the required
AWS resources:

[cloudformation-s3-setup.yaml](./cloudformation-s3-setup.yaml)

To run the template:

**Note that you can change the name of the stack (obsidian-s3-stack) which will
affect the naming of all the created resources!**

```bash
aws cloudformation deploy \
  --template-file cloudformation-s3-setup.yaml \
  --stack-name obsidian-s3-sync-stack \
  --capabilities CAPABILITY_NAMED_IAM
```

To get bucket name and user:

```bash
aws cloudformation describe-stacks \
  --stack-name obsidian-s3-sync-stack \
  --query 'Stacks[0].Outputs[*].[OutputKey,OutputValue]' \
  --output table
```

To create credentials for the user (access key id and secret access key):

```bash
aws iam create-access-key --user-name obsidian-s3-sync-stack-s3-user
```

## Development

This section describes how to develop the plugin.

### Getting started

- Clone this repo to the Obsidian plugin directory.
- Make sure your NodeJS is at least v22 (`node --version`).
- `npm i` or `yarn` to install dependencies.
- `npm run dev` to start compilation in watch mode.
- Enable the plugin in Obsidian.

### How to run tests

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

### Releasing new releases

- Update `manifest.json` with new version number, such as `1.0.1`, and the minimum Obsidian version required for your latest release.
- Update `versions.json` file with `"new-plugin-version": "minimum-obsidian-version"` so older versions of Obsidian can download an older version of your plugin that's compatible.
- Create new GitHub release using your new version number as the "Tag version". Use the exact version number, don't include a prefix `v`. See here for an example: https://github.com/obsidianmd/obsidian-sample-plugin/releases
- Upload the files `manifest.json`, `main.js`, `styles.css` as binary attachments. Note: The manifest.json file must be in two places, first the root path of your repository and also in the release.
- Publish the release.

> You can simplify the version bump process by running `npm version patch`, `npm version minor` or `npm version major` after updating `minAppVersion` manually in `manifest.json`.
> The command will bump version in `manifest.json` and `package.json`, and add the entry for the new version to `versions.json`
