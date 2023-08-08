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
 * Convert a mm/dd/yyyy date to a human readable "Month Day, Year" format.
 * @param {string} date A date in the mm/dd/yyyy format.
 * @returns {string} A human-readable timestamp in the "Month Day, Year" format.
 */
// function formatDate(dateString) {
//     const [month, day, year] = dateString.split('/');
//     return new Date(`${month}/${day}/${year}`).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
// }

/**
 * Authenticate a student with the Conroe ISD servers. 
 * @param {string} usr Username of an Student Access Center account.
 * @param {string} psw Password of an Student Access Center account.
 */
const handleAuth = async (SAMLRes, res) => {
    let masqueradeConfig = {
        // Masquerade as a mobile device (iPhone SE 2nd Generation).
        // The os, browser and resolution are only sent on the first request to Classlink to define the login device for the session.
        // This will be shown in the Login History section of My Analytics.
        os: 'iOS',
        browser: 'Mobile Safari',
        resolution: '375x667',
        // The user agent will be sent on *all* requests to Classlink and Conroe ISD, to match with the login device details.
        // Using the user agent from a physical device is recommended.
        userAgent: "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1"
    }
    
    winston.info(`Handling SAMLResponse with length of ${SAMLRes.length}`)

    const jar = new CookieJar();
    const axiosCJ = wrapper(axios.create({ jar }));

    let stuConsumeResponse = await axiosCJ.request({
        method: 'POST',
        url: 'https://pac.conroeisd.net/Saml/StuConsume.aspx',
        headers: {
            authority: 'pac.conroeisd.net',
            accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.7',
            'accept-language': 'en-US,en;q=0.9',
            'cache-control': 'max-age=0',
            'content-type': 'application/x-www-form-urlencoded',
            origin: 'https://idp.classlink.com',
            referer: 'https://idp.classlink.com/',
            'sec-fetch-dest': 'document',
            'sec-fetch-mode': 'navigate',
            'sec-fetch-site': 'cross-site',
            'upgrade-insecure-requests': '1'
        },
        data: {
            SAMLResponse: SAMLRes,
            method: 'POST'
        }
    }).catch((error) => {
        winston.error(`Got error ${error.response.status} ${error.response.statusText} while calling StuConsume:`)
        console.dir(error.response.data)
        res.status(400).send({
            status: "failed",
            error: 'Error while calling StuConsume.'
        });
        return;
    })

    winston.info(`${stuConsumeResponse.status} ${stuConsumeResponse.statusText} in StuConsume, trying to make session...`);

    let $ = cheerioLoad(stuConsumeResponse.data);

    let viewState = $('#__VIEWSTATE').val();
    let viewStateGenerator = $('#__VIEWSTATEGENERATOR').val();
    let SAMLAssertion = $('input[name="SAMLAssertion"]').val();

    winston.info(`VIEWSTATE: ${viewState}`);
    winston.info(`VIEWSTATEGENERATOR: ${viewStateGenerator}`);
    winston.info(`SAMLAssertion: ${SAMLAssertion}`);

    let consumeResponse = await axiosCJ.request({
        method: 'POST',
        url: 'https://pac.conroeisd.net/Consume.asp',
        headers: {
            'cache-control': 'max-age=0',
            accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.9',
            'accept-encoding': 'gzip, deflate, br',
            'accept-language': 'en-US',
            'content-type': 'application/x-www-form-urlencoded',
            referer: 'https://pac.conroeisd.net/Saml/StuConsume.aspx',
            'sec-fetch-dest': 'document',
            'sec-fetch-mode': 'navigate',
            'sec-fetch-site': 'same-origin',
            'upgrade-insecure-requests': '1',
        },
        data: {
            __VIEWSTATE: viewState,
            __VIEWSTATEGENERATOR: '4072EE9F',
            SAMLAssertion: SAMLAssertion
        }
    }).catch((error) => {
        error(`Got error ${error.response.status} ${error.response.statusText} while calling Consume:`)
        console.dir(error.response.data)
        res.status(400).send({
            status: "failed",
            error: 'Error while calling Consume.'
        });
        return;
    })

    if (consumeResponse.data.includes('This page uses frames, but your browser doesn\'t support them.')) {
        let cookieInfo = jar.toJSON()
        res.send({ status: "success", cookie: cookieInfo.cookies[1] });
    } else {
        winston.error('Expected redirect to loader page but got this:')
        winston.info(consumeResponse.data)
        winston.error('The SAMLResponse may be invalid.')
        res.status(400).send({
            status: "failed",
            error: 'Unexpected response from Conroe ISD.'
        })
        return;
    }
}

/**
 * Fetches a student's courses, along with all assignments in each course.
 * @param {string} token A valid Edformer access token.
 */
const getGrades = async (token, res) => {

    let gradeParams = new URLSearchParams({
        ScheduleMP: "4",
        sortit: "1" // Request sort by due date Gives us a nice big list
    })

    let page = await axios.post('https://pac.conroeisd.net/assignments.asp', gradeParams.toString(), {
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

    let $ = cheerioLoad(page.data)

    let courses = [];
    $('table:contains(Class Averages) tr').each(function (index) {
        if (index > 1) {
            // Extract the data from the row
            let period = $(this).find('td:eq(0)').text().trim();
            let subject = $(this).find('td:eq(1)').text().trim();
            let course = $(this).find('td:eq(2)').text().trim();
            let teacher = $(this).find('td:eq(3)').text().trim();
            let email = $(this).find('td:eq(4) a').attr('href').replace("mailto:", "")
            let average = parseFloat($(this).find('td:eq(5)').text().trim());

            // Create a course object and add it to the array
            let courseObj = {
                period: period,
                subject: subject,
                course: course,
                teacher: teacher,
                teacherEmail: email,
                average: average
            };
            courses.push(courseObj);
        }
    });

    let assignments = [];
    $('table:contains(Description) tr').each(function (index) {
        if (index >= 3) {
            // Extract the data from the row
            let dueDate = $(this).find('td:eq(0)').text().trim();
            let assignedDate = $(this).find('td:eq(1)').text().trim();
            let assignmentName = $(this).find('td:eq(2)').text().trim();
            let courseId = $(this).find('td:eq(3)').text().trim();
            let category = $(this).find('td:eq(5)').text().trim();
            let score = isNaN(parseFloat($(this).find('td:eq(6)').text().trim())) ? $(this).find('td:eq(6)').text().trim() : parseFloat($(this).find('td:eq(6)').text().trim()); // This feels really weird and I don't like it. It gets the job done though.
            let percent = parseFloat($(this).find('td:eq(11)').text().trim());
            // Create a course object and add it to the array
            let assignmentObj = {
                dueDate: dueDate,
                assignedDate: assignedDate,
                assignmentName: assignmentName,
                courseId: courseId,
                category: category,
                score: score,
                percentage: percent
            };
            assignments.push(assignmentObj);
        }
    });

    // console.log(assignments)

    // Print the array of course objects to the console
    // console.log(assignments);

    for (let assignment of assignments) {
        console.log(assignment)
        let courseRef = courses.find(course => course.course === assignment.courseId)
        if (courseRef.assignments) {
            courseRef.assignments.push(assignment)
        } else {
            courseRef.assignments = []
            courseRef.assignments.push(assignment)
        }
    }

    // Assemble our response form, by grabbing all of the data.
    const responseData = {
        status: "success",
        markingPeriod: parseInt($('select.logininput3:nth-child(1)').val()),
        classAverages: courses
    }

    res.send(responseData);
}

/**
 * Fetches a student's absences.
 * @param {string} token A valid Edforma access token.
 */

const getAbsences = async (token, res) => {

    let page = await axios.get('https://pac.conroeisd.net/Absences.asp', {
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

    let $ = cheerioLoad(page.data)
    let absences = []
    $('body > center > center > table tr[align]').each(function () {
        absences.push({
            date: formatDate($(this).find('td:nth-child(1)').text()),
            day: $(this).find('td:nth-child(2)').text(),
            // TODO: put the period absences in here
        })
    })

    const responseData = {
        status: "success",
        absences
    }
    res.send(responseData);
}

/**
 * Fetches a student's referrals.
 * @param {string} token A valid Edforma access token.
 */
const getReferrals = async (token, res) => {

    let page = await axios.get('https://pac.conroeisd.net/referrals.asp', {
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

    let $ = cheerioLoad(page.data)
    let referrals = []
    $('body > center > table tr:not([class="trc"])').each(function () {
        referrals.push({
            creationDate: formatDate($(this).find('td:nth-child(1)').text()),
            submitter: $(this).find('td:nth-child(2)').text(),
            incidentDate: formatDate($(this).find('td:nth-child(3)').text()),
            adminDate: formatDate($(this).find('td:nth-child(6)').text()),
            description: $(this).find('td:nth-child(4)').text(),
            administrator: $(this).find('td:nth-child(5)').text(),
            code: parseInt($(this).find('td:nth-child(7)').text()),
            consequences: $(this).find('td:nth-child(8)').text(), // TODO: Objectify this so Edforma can process it neatly. Also, students can get more than one consequence.
            adminComments: $(this).find('td:nth-child(9)').text(),
        })
    })

    const responseData = {
        status: "success",
        referrals
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

export { handleAuth };
