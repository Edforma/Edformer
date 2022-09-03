# Edformer

The API for Edforma.

**Disclaimer:** This program is not affiliated with CISD.

## How does it work?

### Login flow
Enboard, the Conroe ISD SSO, uses a special endpoint on the SAC webserver in order to gain login credentials: `sac.asp`. Sending a username and password (along with soem Enboard parameters) will return a logged in session. Edformer utilizes this endpoint, allowing for logins to be as fast as they are on the real SSO.

### add more later lol

## How do I use it?

Clone this repo: `git clone https://github.com/Edforma/Edformer.git`.

Run `yarn install` to download all of the required dependencies.

Modify `config.json` to your needs.

Finally, run `node index.js`. If you are running Edformer in this directory for the first time, two directorys will be made: `data` for database storage, and `logs` for log files.


## Troubleshooting/Questions

### How do I make Edformer accessible from outside networks?
Try [ngrok.](https://ngrok.com/)

## Credits

- Winston
- Express
- Cheerio
- XPath
- Axios
- Sentry
