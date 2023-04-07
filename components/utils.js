import { fromNode, fromPageSource } from 'xpath-html';

import { CookieJar } from 'tough-cookie';
import PouchDB from 'pouchdb';
import { URLSearchParams } from 'url';
import axios from 'axios'; // Sending requests
import { load as cheerioLoad } from 'cheerio';
import { randomUUID } from "crypto";
import winston from 'winston'
import { wrapper } from 'axios-cookiejar-support';

const db = new PouchDB('data')

/**
 * Obtains the raw cookie data that belongs to an access token.
 * @param {string} token A valid Edformer access token.
 * @returns {string} The ASPSESSION cookie string.
 */
const _authCookie = async (accessToken) => {
    // Obtain the session token's document.
    let authDoc = await db.get("session-" + accessToken);
    // Return the cookie data stored inside the document.
    return authDoc.cookieData.name + '=' + authDoc.cookieData.token;
}

/**
 * Authenticate a student with the Conroe ISD servers. 
 * @param {string} usr Username of an Student Access Center account.
 * @param {string} psw Password of an Student Access Center account.
 */
const login = async (usr, psw, res) => {
    winston.info(`${usr} - Beginning login`)

    const jar = new CookieJar()
    const axiosTc = wrapper(axios.create({ jar }))

    // Assemble parameters; I'm unsure if we exactly *need* the __EVENT... or __ASYNCPOST parameters or not; I'm keeping them here as it's what
    // CL sends, and we want to replicate the login flows for CL as close as possible to ensure everything works right.
    let dataToSend = new URLSearchParams({
        stuuser: usr,
        password: psw
    })

    await axiosTc.post('https://pac.conroeisd.net/sso.asp?u=1', dataToSend.toString(), {
        headers: {
            accept: '*/*',
            'content-type': 'application/x-www-form-urlencoded'
        }
    }).then((r) => {
        // Looks for a response regarding invalid creds
        // "User not found or incorrect information."
        if (r.data.indexOf("User not found or incorrect information.") >= 0) {
            // Set the status code to 401, and send the error message.
            return res.status(401).send({ status: "failed", error: "User not found or incorrect information." })
        }

        // Just some cookie storage
        let cookieInfo = jar.toJSON().cookies[0]
        let accessToken = randomUUID()

        db.put({
            "_id": "session-" + accessToken,
            cookieData: { name: cookieInfo.key, token: cookieInfo.value }
        }).catch((e) => {
            return winston.error(`${usr} - Failed to put session doc. ${e}`)
        })
        res.send({ status: "success", accessToken: accessToken });
    })
}

/**
 * Fetches a student's information (registration, attendence, transport, etc)
 * @param {string} token A valid Edformer access token.
 */
const getStudentData = async (token, res) => {
    // This function will use a given session ID to contact the SAC page, and to
    // get some basic user data. Triggered by /user/getDetails.

    let studentInfoPage = await axios.get('https://pac.conroeisd.net/student.asp', {
        headers: {
            'cookie': await _authCookie(token)
        }
    });

    if (studentInfoPage.data.indexOf("Session has ended") >= 0) {
        res.status(400).send({
            status: "failed",
            error: "Invalid/ended session"
        });
        return;
    }

    const $ = cheerioLoad(studentInfoPage.data);

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

/**
 * Fetches a student's courses, along with all assignments in each course.
 * @param {string} token A valid Edformer access token.
 */
const getGrades = async (token, res) => {
    let page = await axios.get('https://pac.conroeisd.net/assignments.asp', {
        headers: {
            'cookie': await _authCookie(token)
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

    if (page.data.indexOf("Viewing of grades is currently disabled") >= 0) {
        res.status(400).send({
            status: "failed",
            error: "Viewing of grades is disabled"
        });
        return;
    }

    const classAssignments = fromPageSource(page.data) // Select current page as source
        .findElements("//center/table/tbody/tr/td/font/strong") // Find assignments table
        .map(classAssignmentTableTitleNode => {
            var tableNodeXPath = fromNode(
                classAssignmentTableTitleNode.parentNode.parentNode.parentNode.parentNode.parentNode
            );

            var course = classAssignmentTableTitleNode.textContent.trim().split("•")[1].trim();

            var assignments = tableNodeXPath
                .findElements('//tr[@bgcolor]')
                .flatMap(trNode => {
                    console.log(isNaN(parseFloat(trNode.childNodes[4].textContent.trim())) ? trNode.childNodes[4].textContent.trim() : parseFloat(trNode.childNodes[4].textContent.trim()))
                    return trNode.childNodes.length == 10
                        ? [{
                            dueDate: trNode.childNodes[0].textContent.trim(),
                            assignedDate: trNode.childNodes[1].textContent.trim(),
                            assignmentName: trNode.childNodes[2].textContent.trim(),
                            category: trNode.childNodes[3].textContent.trim(),
                            score: isNaN(parseFloat(trNode.childNodes[4].textContent.trim())) ? trNode.childNodes[4].textContent.trim() : parseFloat(trNode.childNodes[4].textContent.trim()), // This feels really weird and I don't like it. It gets the job done though.
                            totalPoints: parseInt(trNode.childNodes[7].textContent.trim()),
                            percentage: parseInt(trNode.childNodes[9].textContent.trim())
                        }]
                        : []
                });

            return { course, assignments }
        })
        .reduce((acc, assignments) => {
            return { ...acc, [assignments.course]: assignments }
        }, {});

    const classAverages = fromNode(
        fromPageSource(page.data).findElement("//font[contains(text(), 'Class Averages')]")
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

    // Assemble our response form, by grabbing all of the data.
    const responseData = {
        status: "success",
        classAverages
    }

    res.send(responseData);
}

/**
 * Logs a student out. This will be reflected in the database AND Conroe ISD's servers.
 * @param {string} token A valid Edformer access token.
 */
const logout = async (token, res) => {
    // The purpose of this function is to end a session, once it's fufilled it's purpose.

    // Create a logout request.
    await axios.get('https://pac.conroeisd.net/logout.asp', {
        headers: {
            'cookie': await _authCookie(token)
        }
    });
    res.send({
        status: "success"
    });

}

export { login };
export { getStudentData };
export { getGrades };
export { logout };
