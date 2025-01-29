@MomsFriendlyDevCo/Freedcamp
============================
Freedcamp API wrapper.

This module provides a generic Freedcamp API wrapper which includes Auth and Issues access.

```javascript
import {FCAuth, FCIssues} from '@momsfriendlydevco/freedcamp';

let fcAuth = new FCAuth({
    // Freedcamp API access
    secret: 'XXX',
    apikey: 'XXX',
    project: 'XXX', // Primary project to use (can be overridden with `{global: false}`)

    // Caching options
    // This will work out of the box using the local filesystem
    // For more complex config see https://github.com/MomsFriendlyDevCo/generic-cache
    // Can be either a string / array for caching modules, an object or caching options or a Cache() instance
    cache: {},
});

// Establish access
await fcAuth.init();


// Access Freedcamp issues
let fcIssues = new FCIssues({auth: fcAuth});

// Fetch everything
await fcIssues.fetchAll() //= Array<Object>


// Fetch an issue by its reference (e.g. `ABC-1234`)
await fcIssues.get('ABC-1234') //= Object
```


API
===
Below is a selection of relevent API methods. See the source code for the full JSDoc commented function definitions and data specs.


FCAuth(options)
---------------
Class constructor for a Freedcamp Authorization instance.

Options can be the strings `secret`, `apikey`, `project` to specify Freedcamp options

Caching options can be specified via `cache` matching the spec used by [@MomsFriendlyDevCo/cache](https://github.com/MomsFriendlyDevCo/generic-cache) - but will work out of the box using the local filesystem.


FCAuth.init()
-------------
Setup the auth library, optionally reading in .env files or environment variables.


FCIssues(options)
-----------------
Class constructor for a Freedcamp Issues instance.

Options can be `auth` which is a `FCAuth` instance and/or `cache` which is an overriding cache if this differs from that in the `auth` option.


FCIssues.Issue
--------------
Issue specifier format used by this module.
This format is used for individual issues returned by `FCIssues.get()` or all issues from `FCIssues.fetchAll()`.

| Property           | Type            | Description                                                                         |
|--------------------|-----------------|-------------------------------------------------------------------------------------|
| `id`               | `String`        | The FC ID of the issue                                                              |
| `project`          | `String`        | The FC Project ID of the issue                                                      |
| `ref`              | `String`        | The human readable reference                                                        |
| `title`            | `String`        | The issue title                                                                     |
| `assignee`         | `String`        | The name of the person assigned                                                     |
| `status`           | `String`        | The status title of the issue                                                       |
| `url`              | `String`        | The URL of the issue                                                                |
| `html`             | `String`        | HTML body of the issue                                                              |
| `raw`              | `Object`        | The raw, original issue object (only provided if `FCIssues.includeRaw` is truthy)   |
| `comments`         | `Array<Object>` | Optional comment stream (available via `FCIssues.get(ref, {comments: true})`)       |
| `comments.id`      | `String`        | The FC comment ID                                                                   |
| `comments.created` | `Number`        | The original creation date of the comment in JavaScript Unix epoc                   |
| `comments.edited`  | `Number`        | Comment last updated (or omitted if not)                                            |
| `comments.user`    | `String`        | The name of the poster                                                              |
| `comments.url`     | `String`        | Direct link to the comment                                                          |
| `comments.html`    | `String`        | HTML body of the comment                                                            |
| `comments.raw`     | `String`        | The raw, original comment object (only provided if `FCIssues.includeRaw` is truthy) |



FCIssues.fetchAll(options)
--------------------------
Fetch all issues and optionally cache for future reference
This function uses caching by default unless `options.cache.enabled=false`.

Options can be:

| Option   | Type      | Default | Description                                                                                                    |
|----------|-----------|---------|----------------------------------------------------------------------------------------------------------------|
| `force`  | `Boolean` | `false` | Whether to force the search, even if caching is present                                                        |
| `global` | `Boolean` | `false` | Fetch issues from all projects instead of just the primary project                                             |
| `limit`  | `Number`  | `100`   | How many issues to pull down at once                                                                           |
| `offset` | `Number`  | `-1`    | Overriding offset to start pulling from, will pull once only and ignore page calculations, use `-1` to disable |

Returns a promise which will resolve with the full collection of all issues fetched.


FCIssues.get(ref, options)
--------------------------
Fetch an issue by its ref (e.g. `ABC-1234`).
This will use the cached issue if it is available.

Options can be:


| Option     | Type      | Default | Description                                                        |
|------------|-----------|---------|--------------------------------------------------------------------|
| `global`   | `Boolean` | `false` | Fetch issues from all projects instead of just the primary project |
| `comments` | `Boolean` | `false` | Also fetch associated comment collection                           |
| `cache`    | `Object`  |         | cache.worker() options                                             |

Returns a promise which will resolve with the found issue, if any.
