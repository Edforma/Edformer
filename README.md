# SSOWrapper

A REST API wrapper for Conroe ISD's Student Access Center.

**Disclaimer:** This program is not affiliated with CISD.

## How does it work?

### Login flow
SSOWrapper currently uses Selenium to create a "fake" session. It opens the login page and enters the details given from the request, and when it reaches the home page of the SSO, it "clicks" on the Student Access Center button. It then processes the SAC cookie, and sends the request-maker back a token that can be used to get information from the Student Access Center. For the most detail, see `utils-async.js`.


### add more later lol

## How do I use it?

Clone this repo: `git clone https://github.com/SACMobile-Team/SSOWrapper.git`.

Run `yarn install` to download all of the required dependencies.

Modify `config.json` to your needs.

Finally, run `node .`. If you are running SSOWrapper in this directory for the first time, two directorys will be made: `data` for database storage, and `logs` for log files.


## Troubleshooting/Questions

### How do I make SSOWrapper accessible from outside networks?
Try [ngrok.](https://ngrok.com/)