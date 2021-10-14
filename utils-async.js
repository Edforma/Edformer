const { Driver } = require("selenium-webdriver/chrome");
const until = require("selenium-webdriver/lib/until");
const assert = require('assert');
const axios = require('axios') // Sending requests
const cheerio = require('cheerio');

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
        // At this point, we should have two cookies: ASPSESSIONID********** (random letters), and SSOEA.
        // We only care about the first one. For some reason, this is the ONLY cookie you need to access SAC.
        // To make things worse, it's not set to httpOnly! Come on, Terry McClaugherty!
        // Anyways, SSOEA is just a token used for other SSO stuff we don't care about.
        // ASPSESSIONID should be the first cookie grabbed by getCookies(), so because i'm too lazy to filter
        // JSON at 10:09 PM, i'm just gonna steal the first cookie in the array. 

        let sacCookie = cookies[0]; // Who needs to filter anyways
        res.send({ status: "success", cookieData: { name: sacCookie.name, token: sacCookie.value}});
    })

    // Finish up by closing the tab, it has done it's job!
    await driver.quit();

}

const getStudentData = async (sessionid, res) => {
    
    // This function will use a given session ID to contact the SAC page, and to
    // get some basic user data. Triggered by /user/getDetails.

    let studentInfoPage = await axios.get('https://pac.conroeisd.net/student.asp', {
        headers: {
            'cookie': sessionid
        }
    });

    const $ = cheerio.load(studentInfoPage.data);

    // Assemble our response form, by grabbing all of the data.
    const responseData = {
        status: "success",
        registration: {
            name: $("body > center > table > tbody > tr > td:nth-child(2) > table:nth-child(3) > tbody > tr:nth-child(2) > td:nth-child(2)").text(),
            grade: parseInt($("body > center > table > tbody > tr > td:nth-child(2) > table:nth-child(3) > tbody > tr:nth-child(2) > td:nth-child(4)").text()),
            counselor: {
                name: $("body > center > table > tbody > tr > td:nth-child(2) > table:nth-child(3) > tbody > tr:nth-child(3) > td:nth-child(2)").contents().text().trim(),
                email: $("body > center > table > tbody > tr > td:nth-child(2) > table:nth-child(3) > tbody > tr:nth-child(3) > td:nth-child(2) > a").attr('title')
            },
            homeroom: {
                name: $("body > center > table > tbody > tr > td:nth-child(2) > table:nth-child(3) > tbody > tr:nth-child(3) > td:nth-child(6)").contents().text().trim(),
                email: $("body > center > table > tbody > tr > td:nth-child(2) > table:nth-child(3) > tbody > tr:nth-child(3) > td:nth-child(6) > a").attr('title')
            }
        },
        attendance: {
            totalAbsences: parseInt($("body > center > table > tbody > tr > td:nth-child(2) > table:nth-child(3) > tbody > tr:nth-child(6) > td:nth-child(2)").text()),
            totalTardies: parseInt($("body > center > table > tbody > tr > td:nth-child(2) > table:nth-child(3) > tbody > tr:nth-child(6) > td:nth-child(4)").text())
        },
        transportation: {
            busToCampus: $("body > center > table > tbody > tr > td:nth-child(2) > table:nth-child(3) > tbody > tr:nth-child(9) > td:nth-child(2)").text(),
            busToCampusStopTime: `${$("body > center > table > tbody > tr > td:nth-child(2) > table:nth-child(3) > tbody > tr:nth-child(9) > td:nth-child(4)").text()} ${$("body > center > table > tbody > tr > td:nth-child(2) > table:nth-child(3) > tbody > tr:nth-child(9) > td:nth-child(6)").text()}`,
            busFromCampus: $("body > center > table > tbody > tr > td:nth-child(2) > table:nth-child(3) > tbody > tr:nth-child(10) > td:nth-child(2)").text(),
            busFromCampusStopTime: `${$("body > center > table > tbody > tr > td:nth-child(2) > table:nth-child(3) > tbody > tr:nth-child(10) > td:nth-child(4)").text()} ${$("body > center > table > tbody > tr > td:nth-child(2) > table:nth-child(3) > tbody > tr:nth-child(10) > td:nth-child(6)").text()}`
        },
        misc: {
            lunchFunds: $("body > center > table > tbody > tr > td:nth-child(2) > table:nth-child(3) > tbody > tr:nth-child(14) > td:nth-child(2)").text(),
            studentUsername: $("body > center > table > tbody > tr > td:nth-child(2) > table:nth-child(3) > tbody > tr:nth-child(16) > td:nth-child(2)").text(),
            studentID: $("body > center > table > tbody > tr > td:nth-child(2) > table:nth-child(3) > tbody > tr:nth-child(15) > td:nth-child(2)").text(),
            lastSessionTimestamp: $("body > center > table > tbody > tr > td:nth-child(2) > table:nth-child(3) > tbody > tr:nth-child(21) > td:nth-child(2)").text()
        }
    }

    res.send(responseData);
}
const destroySACSession = async (sessioncookieToDestroy, res) => {
    // The purpose of this function is to end a session, once it's fufilled it's purpose.
    // This is just the complete opposite of what /login does: it logs out.

    // Create a logout request.
    let logoutRequest = await axios.get('https://pac.conroeisd.net/logout.asp', {
        headers: {
          'cookie': sessioncookieToDestroy
        }
      });
    console.log(logoutRequest);
    res.send();

}

exports.loginSSO = loginSSO;
exports.getStudentData = getStudentData;
exports.destroySACSession = destroySACSession;