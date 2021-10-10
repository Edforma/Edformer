const { Driver } = require("selenium-webdriver/chrome");
const until = require("selenium-webdriver/lib/until");
const assert = require('assert')

const loginSSO = async (username, password, res) => {

    // Include the chrome driver
    require("chromedriver");

    // Include selenium webdriver
    let swd = require("selenium-webdriver");
    let browser = new swd.Builder();
    let driver = browser.forBrowser("chrome").build();


    // Step 1 - Opening the sign in page
    let tabToOpen = await driver.get("https://sso.conroeisd.net/_authn/Logon?ru=L3Nzby9wb3J0YWw=");
    
    let findTimeOutP = await driver.manage().setTimeouts({implicit: 10000});

    //Store the ID of the original window
    const originalWindow = await driver.getWindowHandle();

    //Check we don't have other windows open already
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

    await driver.wait(until.titleContains('Student Information System'), 10000);
    
    await driver.manage().getCookies().then(function (cookies) {
        res.send(cookies)
    })

}

exports.loginSSO = loginSSO;