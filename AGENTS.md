# sigil

## Local install after every change

On the user's machines `sigil` is the release bundle in `~/.local/bin`,
installed by the workspace `update-local-tool` skill. A change is not done when
it merges or releases. It is done when the user's local `sigil` runs it. The
user does not watch for this, so do it without being asked:

1. After the release workflow for your change succeeds, check whether the tool is
   installed: `command -v sigil`. If it is not, stop here.
2. Run `bash ~/workspace/.agents/skills/update-local-tool/update.sh sigil`. It prints `before -> after`.
3. Check your change with the installed binary, for example `sigil @schema` or the
   command you changed.
4. Put the `before -> after` line in your final report.

If the release failed, report that. Don't install a local build in its place.
