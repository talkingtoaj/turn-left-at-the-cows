"""Read API keys from ~/.env without printing them."""
import os


def key(name):
    if os.environ.get(name):
        return os.environ[name]
    with open(os.path.expanduser('~/.env')) as f:
        for line in f:
            line = line.strip()
            if line.startswith('export '):
                line = line[7:]
            if line.startswith(name + '='):
                return line.split('=', 1)[1].strip().strip('"').strip("'")
    raise SystemExit('missing key ' + name)
