# pool-manager

## FAQ

### Why?

Needed unified way to work with single thread pools(for now).

### Any documentation?

Not yet

## Troubleshooting

### `Error: spawn ps ENOENT` using `ProcessPoolInstance`

Need to install `procps`

```bash
sudo apt-get update && sudo apt-get -y install procps
```

[issue link](https://github.com/bahmutov/start-server-and-test/issues/132#issuecomment-448581335)
