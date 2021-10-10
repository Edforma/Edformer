const { Driver } = require("selenium-webdriver/chrome");
const until = require("selenium-webdriver/lib/until");
const assert = require('assert')

const loginSSO = async (username, password, res) => {

    // This function is used to log into the Student Access Center page.
    // I *tried* to make it so I could just get it with an API call, but that wasn't working.
    // I kept trying, my dad told me about Selenium. Did I ignore that advice? Yep.
    // Look where we are now.


    // Include the chrome driver
    require("chromedriver");

    // Include selenium webdriver + other stuff
    let swd = require("selenium-webdriver");
    let browser = new swd.Builder();
    let driver = browser.forBrowser("chrome").build();


    // Open the Login Page
    await driver.get("https://sso.conroeisd.net/_authn/Logon?ru=L3Nzby9wb3J0YWw=");
    
    await driver.manage().setTimeouts({implicit: 10000});

    // Store the ID of the original window
    const originalWindow = await driver.getWindowHandle();

    // Check we don't have other windows open already
    assert((await driver.getAllWindowHandles()).length === 1);

    let usernameBox = await driver.findElement(swd.By.css("#Username"));

    // Step 3 - Entering the username
    await usernameBox.sendKeys(username);

    console.log("Username entered successfully");

    // Step 4 - Finding the password input
    let passwordBox = await driver.findElement(swd.By.css("#Password"));

    // Step 5 - Entering the password
    await passwordBox.sendKeys(password);

    console.log("Password entered successfully in");

    // Step 6 - Finding the Sign In button
    let signInBtn = await driver.findElement(swd.By.css("#login-button"));

    // Step 7 - Clicking the Sign In button
    await signInBtn.click();

    let sacButton = await driver.findElement(swd.By.id("Student Access Center"));

    await sacButton.click();

    // Wait for "Student Access Center" to open in a new tab
    await driver.wait(
        async () => (await driver.getAllWindowHandles()).length === 2,
        10000
    );

    // Find the newly opened tab and switch to it
    const windows = await driver.getAllWindowHandles();
    windows.forEach(async handle => {
        if (handle !== originalWindow) {
            await driver.switchTo().window(handle);
        }
    });

    // Wait for Student Access Center to fully render, and to give us our cookie
    await driver.wait(until.titleContains('Student Information System'), 10000);
    
    // Send back the cookie to the device for further usage!
    await driver.manage().getCookies().then(function (cookies) {
        res.send(cookies)
    })

}

exports.loginSSO = loginSSO;