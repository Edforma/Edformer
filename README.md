# Edformer
A RESTful API frontend for Conroe Independent School District's Student Access Center.
**Disclaimer:** This program is not affiliated with CISD! Do not ask them for support.

## How does it work?
Edformer acts as a sort of middleman between you and the Student Access Center. It downloads the webpages for the information you need, and parses it into a program-friendly format that you can process to your heart's content.

## How do I use it?

```bash
git clone https://github.com/Edforma/Edformer.git
yarn install
PORT=3000 node .
```
## Troubleshooting/Questions

### I can't access Edformer at all! What's the deal, man?
Make sure you're setting the PORT environment variable!
## Credits

- Node.JS
    - cheerio, for parsing student information pages
    - express, for serving the API
    - winston, for logging
    - sentry, for debugging
    - pm2, for deployment
    - axios, for networking
    - pouchdb, for database storage
- Conroe Independent School District
    - the student access center, for being the crux of this project <3
