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
 * Convert a mm/dd/yyyy date to a human readable "Month Day, Year" format.
 * @param {string} date A date in the mm/dd/yyyy format.
 * @returns {string} A human-readable timestamp in the "Month Day, Year" format.
 */
function formatDate(dateString) {
    const [month, day, year] = dateString.split('/');
    return new Date(`${month}/${day}/${year}`).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
  }

/**
 * Authenticate a student with the Conroe ISD servers. 
 * @param {string} usr Username of an Student Access Center account.
 * @param {string} psw Password of an Student Access Center account.
 */
const login = async (usr, psw, res) => {
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

    const getTableValue = (key) => {
        return $(`td:contains(${key})`).filter(function() {
            return $(this).text().trim() === key
        }).next().text() 
    }

    // winston.info(getTableValue('Student'))
    // Assemble our response form, by grabbing all of the data.
    const responseData = {
        status: "success",
        registration: {
            name: getTableValue('Student'),
            grade: parseInt(getTableValue('Grade')),
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
            totalAbsences: parseInt(getTableValue('Total Absences')),
            totalTardies: parseInt(getTableValue('Tardies'))
        },
        transportation: {
            busToCampus: getTableValue('Bus To School'),
            busToCampusStopTime: `${getTableValue('Stop Time')} ${getTableValue('Route')}`,
            busFromCampus: getTableValue('Bus From School'),
            busFromCampusStopTime: `${getTableValue('Stop From')} ${getTableValue('Route From')}`,
        },
        misc: {
            lunchFunds: getTableValue('School Meals Available').split(" ")[0],
            studentUsername: getTableValue('Student Username / Password').split(" ")[0],
            studentID: getTableValue('Student ID')
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

    let gradeParams = new URLSearchParams({
        // ScheduleMP: req.headers.mp ? req.headers.mp : null
        sortit: 1 // Request sort by due date Gives us a nice big list
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

    // Create an empty array to hold the course objects
    let courses = [];

    // Loop through each row in the table (skip the first two rows)
    $('body > center > table tr').each(function(index) {
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

    // Create an empty array to hold the course objects
    let assignments = [];

    // Loop through each row in the table (skip the first two rows)
    $('body > center > center > center > table > tbody > tr:nth-child(2) > td > table tr').each(function(index) {
    if (index >= 1) {
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

    // Print the array of course objects to the console
    // console.log(assignments);

    for (let assignment of assignments) {
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
 * Fetches a student's schedule.
 * @param {string} token A valid Edformer access token.
 */
const getSchedule = async (token, res) => {
    // This function will use a given session ID to contact the SAC page, and to
    // get some basic user data. Triggered by /user/getDetails.

    let studentSchedulePage = await axios.get('https://pac.conroeisd.net/sched.asp', {
        headers: {
            'cookie': await _authCookie(token)
        }
    });

    if (studentSchedulePage.data.indexOf("Session has ended") >= 0) {
        res.status(400).send({
            status: "failed",
            error: "Invalid/ended session"
        });
        return;
    }

    const $ = cheerioLoad(studentSchedulePage.data);

    let sem1 = []
    let sem2 = []

    // Semester 1
    $('tr[bgcolor="lightgrey"]').each(function() {
        sem1.push({
            period: $(this).find('td:nth-child(1)').text(),
            subject: $(this).find('td:nth-child(2)').text(),
            course: $(this).find('td:nth-child(3)').text(),
            time: $(this).find('td:nth-child(4)').text(),
            room: $(this).find('td:nth-child(7)').text(),
            teacher: $(this).find('td:nth-child(8)').text()
        })
    });

    // Semester 2
    $('tr[bgcolor="whitesmoke"]').each(function() {
        sem2.push({
            period: $(this).find('td:nth-child(1)').text(),
            subject: $(this).find('td:nth-child(2)').text(),
            course: $(this).find('td:nth-child(3)').text(),
            time: $(this).find('td:nth-child(4)').text(),
            room: $(this).find('td:nth-child(7)').text(),
            teacher: $(this).find('td:nth-child(8)').text()
        })
    });

    const responseData = {
        status: "success",
        semesters: {
            sem1,
            sem2
        }
    }
    res.send(responseData);
}

/**
 * Fetches a student's progress reports
 * @param {string} token A valid Edformer access token.
 */
const getProgReports = async (token, res) => {

    let page = await axios.get('https://pac.conroeisd.net/progrpt.asp', {
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

    var progressReports = []; // Array to store progress reports

    $("table:not(:has(table)):contains('Progress Report')").each(function () {
        var tableRows = $(this).find("tr");

        var tablePeriods = []; // Array to store periods within the table

        // Extract the date from the specified table row with class "trc"
        var dateText = $(this).find("tr.trc").text();
        var date = dateText.match(/\d{1,2}\/\d{1,2}\/\d{4}/)[0]; // Extract date using regex

        // Start iteration from index 2 to skip the top two header rows
        for (var i = 2; i < tableRows.length; i++) {
            var row = tableRows[i];
            var period = $(row).find("td:eq(0)").text().replace(/\s+/g, ' ').trim();
            var subject = $(row).find("td:eq(1)").text().replace(/\s+/g, ' ').trim();
            var course = $(row).find("td:eq(2)").text().replace(/\s+/g, ' ').trim();
            var teacher = $(row).find("td:eq(3)").text().replace(/\s+/g, ' ').trim();
            var average = parseInt($(row).find("td:eq(4)").text().replace(/\s+/g, ' ').trim());

            // Create an object for the row data
            var rowData = {
                period: period,
                subject: subject,
                course: course,
                teacher: teacher,
                average: average
            };

            tablePeriods.push(rowData);
        }

        // Create an object to hold the table data
        var tableData = {
            date: formatDate(date),
            periods: tablePeriods
        };

        progressReports.push(tableData);
    });


    // Assemble our response form, by grabbing all of the data.
    const responseData = {
        status: "success",
        progressReports
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

export { login };
export { getStudentData };
export { getGrades };
export { getSchedule };
export { getProgReports };
export { getAbsences }
export { getReferrals }
export { logout };
