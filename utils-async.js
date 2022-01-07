const { Driver } = require("selenium-webdriver/chrome");
const until = require("selenium-webdriver/lib/until");
const assert = require('assert');
const axios = require('axios') // Sending requests
const cheerio = require('cheerio');
const xpath = require('xpath-html');
const { randomUUID } = require("crypto");
const PouchDB = require('pouchdb')
const db = new PouchDB('data')
const logger = require('winston')

// Utility stuff for other functions
const authCookie = async function(accessToken) {
    let authDoc = await db.get("session-" + accessToken)
    return authDoc.cookieData.name + '=' + authDoc.cookieData.token
}

// Functions called directly by api
const loginSSO = async (username, password, res) => {
    // This function is used to log into the Student Access Center page.
    // I *tried* to make it so I could just get it with an API call, but that wasn't working.
    // I kept trying, my dad told me about Selenium. Did I ignore that advice? Yep.
    // Look where we are now.

    logger.info(`Beginning login for user ${username}`)
    // Include the chrome driver
    require("chromedriver");

    // Include selenium webdriver + other stuff
    let swd = require("selenium-webdriver");
    let browser = new swd.Builder();
    let driver = browser.forBrowser("chrome").build()
    
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
    logger.info(`${username} - Entered username`)

    // Step 4 - Finding the password input
    let passwordBox = await driver.findElement(swd.By.css("#Password"));

    // Step 5 - Entering the password
    await passwordBox.sendKeys(password);
    logger.info(`${username} - Entered password`)

    // Step 6 - Finding the Sign In button
    let signInBtn = await driver.findElement(swd.By.css("#login-button"));

    // Step 7 - Clicking the Sign In button
    await signInBtn.click();

    logger.info(`${username} - Sign in req sent. Waiting for page...`)
    let sacButton = await driver.findElement(swd.By.id("Student Access Center"))
    .catch((e) => {
        return logger.error(`${username} - Failed to find SAC button; did the login fail?`);
    })

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
    logger.info(`${username} - SAC login finished. Creating session.`)
    
    // Send back the cookie to the device for further usage!
    await driver.manage().getCookies().then(function (cookies) {
        // At this point, we should have two cookies: ASPSESSIONID********** (random letters), and SSOEA.
        // We only care about the first one. For some reason, this is the ONLY cookie you need to access SAC.
        // To make things worse, it's not set to httpOnly! Come on, Terry McClaugherty!
        // Anyways, SSOEA is just a token used for other SSO stuff we don't care about.
        // ASPSESSIONID should be the first cookie grabbed by getCookies(), so because i'm too lazy to filter
        // JSON at 10:09 PM, i'm just gonna steal the first cookie in the array. 

        let sacCookie = cookies[0];

        let accessToken = randomUUID();

        var sessionDoc = {
            "_id": "session-" + accessToken,
            cookieData: { name: sacCookie.name, token: sacCookie.value}
        }
        db.put(sessionDoc)
        .catch((e) => {
            return logger.error(`${username} - Failed to put session doc. ${e}`)
        })

        logger.info(`${username} - Created session UUID: ${sessionDoc._id}`)

        logger.info(`${username} - Responded with session!`)
        res.send({ status: "success", accessToken: accessToken});
    })

    // Finish up by closing the tab, it has done it's job!
    await driver.quit();

}
const getStudentData = async (accessToken, res) => {  
    // This function will use a given session ID to contact the SAC page, and to
    // get some basic user data. Triggered by /user/getDetails.

    let studentInfoPage = await axios.get('https://pac.conroeisd.net/student.asp', {
        headers: {
            'cookie': await authCookie(accessToken)
        }
    });

    if (studentInfoPage.data.indexOf("Session has ended") >= 0) {
        res.status(400).send({
            status: "failed",
            error: "Invalid/ended session"
        });
        return;
    }

    const $ = cheerio.load(studentInfoPage.data);

    // Assemble our response form, by grabbing all of the data.
    const responseData = {
        status: "success",
        registration: {
            name: $("body > center > table > tbody > tr > td:nth-child(2) > table > tbody > tr:nth-child(2) > td:nth-child(2)").text(),
            grade: parseInt($("body > center > table > tbody > tr > td:nth-child(2) > table > tbody > tr:nth-child(2) > td:nth-child(4)").text()),
            studentPicture: 'https://pac.conroeisd.net/' + $("body > table > tbody > tr > td:nth-child(1) > img").attr('src'),
            counselor: {
                name: $("body > center > table > tbody > tr > td:nth-child(2) > table > tbody > tr:nth-child(3) > td:nth-child(2)").contents().text().trim(),
                email: $("body > center > table > tbody > tr > td:nth-child(2) > table > tbody > tr:nth-child(3) > td:nth-child(2) > a").attr('title')
            },
            homeroom: {
                name: $("body > center > table > tbody > tr > td:nth-child(2) > table > tbody > tr:nth-child(3) > td:nth-child(6)").contents().text().trim(),
                email: $("body > center > table > tbody > tr > td:nth-child(2) > table > tbody > tr:nth-child(3) > td:nth-child(6) > a").attr('title')
            }
        },
        attendance: {
            totalAbsences: parseInt($("body > center > table > tbody > tr > td:nth-child(2) > table > tbody > tr:nth-child(6) > td:nth-child(2)").text()),
            totalTardies: parseInt($("body > center > table > tbody > tr > td:nth-child(2) > table > tbody > tr:nth-child(6) > td:nth-child(4)").text())
        },
        transportation: {
            busToCampus: $("body > center > table > tbody > tr > td:nth-child(2) > table > tbody > tr:nth-child(9) > td:nth-child(2)").text(),
            busToCampusStopTime: `${$("body > center > table > tbody > tr > td:nth-child(2) > table > tbody > tr:nth-child(9) > td:nth-child(4)").text()} ${$("body > center > table > tbody > tr > td:nth-child(2) > table > tbody > tr:nth-child(9) > td:nth-child(6)").text()}`,
            busFromCampus: $("body > center > table > tbody > tr > td:nth-child(2) > table > tbody > tr:nth-child(10) > td:nth-child(2)").text(),
            busFromCampusStopTime: `${$("body > center > table > tbody > tr > td:nth-child(2) > table > tbody > tr:nth-child(10) > td:nth-child(4)").text()} ${$("body > center > table > tbody > tr > td:nth-child(2) > table > tbody > tr:nth-child(10) > td:nth-child(6)").text()}`
        },
        misc: {
            lunchFunds: $("body > center > table > tbody > tr > td:nth-child(2) > table > tbody > tr:nth-child(14) > td:nth-child(2)").text().split(" ")[0],
            studentUsername: $("body > center > table > tbody > tr > td:nth-child(2) > table > tbody > tr:nth-child(16) > td:nth-child(2)").text(),
            studentID: $("body > center > table > tbody > tr > td:nth-child(2) > table > tbody > tr:nth-child(15) > td:nth-child(2)").text(),
//            lastSessionTimestamp: $("body > center > table > tbody > tr > td:nth-child(2) > table > tbody > tr:nth-child(21) > td:nth-child(2)").text() Currently breaks on failing grades
        }
    }
    res.send(responseData);
}
const getGrades = async (accessToken, res) => {
    let page = await axios.get('https://pac.conroeisd.net/assignments.asp', {
        headers: {
            'cookie': await authCookie(accessToken)
        }
    });

    // Detect an ended/invalid session
    if (page.data.indexOf("Session has ended") >= 0) {
        res.status(400).send({
            status: "failed",
            error: "Invalid/ended session"
        });
        return;
    }

    if (page.data.indexOf("No Averages for this student") >= 0) {
        res.status(400).send({
            status: "failed",
            error: "No averages are available for viewing"
        });
        return;
    }

    const classAssignments = xpath
        .fromPageSource(page.data) // Select current page as source
        .findElements("//center/table/tbody/tr/td/font/strong") // Find assignments table
        .map(classAssignmentTableTitleNode => {
            var tableNodeXPath = xpath.fromNode(
                classAssignmentTableTitleNode.parentNode.parentNode.parentNode.parentNode.parentNode
            );

            var course = classAssignmentTableTitleNode.textContent.trim().split("•")[1].trim();

            var assignments = tableNodeXPath
                .findElements('//tr[@bgcolor]')
                .flatMap(trNode => {
                    return trNode.childNodes.length == 10 
                        ? [{
                            dueDate: trNode.childNodes[0].textContent.trim(),
                            assignedDate: trNode.childNodes[1].textContent.trim(),
                            assignmentName: trNode.childNodes[2].textContent.trim(),
                            category: trNode.childNodes[3].textContent.trim(),
                            score: parseFloat(trNode.childNodes[4].textContent.trim()),
                            totalPoints: parseInt(trNode.childNodes[7].textContent.trim())
                        }]
                        : []
                });

            return { course, assignments }
        })
        .reduce((acc, assignments) => {
            return {...acc, [assignments.course]: assignments}
        }, {});

    const classAverages = xpath
        .fromNode(
            xpath.fromPageSource(page.data).findElement("//font[contains(text(), 'Class Averages')]")
                .parentNode.parentNode.parentNode.parentNode.parentNode
        )
        .findElements('//tr[@bgcolor]')
        .map(trNode => {
            var course = trNode.childNodes[2].textContent.trim();

            return {
                period: trNode.childNodes[0].textContent.trim(),
                subject: trNode.childNodes[1].textContent.trim(),
                course: course,
                teacher: trNode.childNodes[3].textContent.trim(),
                teacherEmail: trNode.childNodes[4].childNodes[0].getAttribute("href").split("mailto:")[1],
                average: parseFloat(trNode.childNodes[5].textContent.trim()),
                assignments: classAssignments[course].assignments
            }
        });

    // const classAssignments = classAverages
    //     .map(classAvg => {
    //         return xpath
    //             .fromNode(
    //                 xpath.fromPageSource(page.data).findElement("//table/*/strong[contains(text(), '" + classAvg.course + "')]")
    //                     .parentNode.parentNode.parentNode.parentNode.parentNode
    //             )
    //             .map(trNode => {
    //                 return {
    //                     dueDate: trNode.childNodes[0].textContent.trim(),
    //                     assignedDate: trNode.childNodes[1].textContent.trim(),
    //                     title: trNode.childNodes[2].textContent.trim(),
    //                 }
    //             });
    //     })
    



    // Assemble our response form, by grabbing all of the data.
    const responseData = {
        status: "success",
        classAverages
    }

    res.send(responseData);
}
const getSchedule = async (accessToken, res) => {
    let studentInfoPage = await axios.get('https://pac.conroeisd.net/sched.asp', {
        headers: {
            'cookie': await authCookie(accessToken)
        }
    });
}
const destroySACSession = async (accessToken, res) => {
    // The purpose of this function is to end a session, once it's fufilled it's purpose.
    // This is just the complete opposite of what /login does: it logs out.

    // Create a logout request.
    let logoutRequest = await axios.get('https://pac.conroeisd.net/logout.asp', {
        headers: {
          'cookie': await authCookie(accessToken)
        }
      });
    console.log(logoutRequest);
    res.send({
        status: "success"
    });

}

exports.loginSSO = loginSSO;
exports.getStudentData = getStudentData;
exports.getGrades = getGrades;
exports.getSchedule = getSchedule;
exports.destroySACSession = destroySACSession;