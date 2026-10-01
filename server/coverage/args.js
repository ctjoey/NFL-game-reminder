// Reading command-line flags, in the one place both coverage CLIs read them from.
//
// This exists because the same bug happened three times. `flag()` returns the token after the
// name, which is right for `--week 4` and silently wrong for a switch like `--save`: the next
// token is the following flag, or there is no next token at all, and either way the switch reads
// as unset. `--save` never saved, `--alert` never alerted, and both failures were invisible -
// the run passed, having quietly not done the thing.
//
// So a switch gets its own accessor, and the two are hard to confuse because they are named for
// what they answer: what is the value, and is it there.

/// `flag` for a value, `has` for a switch. Both read the same argument list.
export function flags(argv) {
  const flag = (name, fallback = undefined) => {
    const i = argv.indexOf(`--${name}`);
    return i >= 0 && argv[i + 1] && !argv[i + 1].startsWith('--') ? argv[i + 1] : fallback;
  };
  const has = (name) => argv.includes(`--${name}`);
  return { flag, has };
}
