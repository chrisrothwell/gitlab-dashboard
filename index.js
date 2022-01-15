const prompt = require('prompt');
const cliSelect = require('cli-select');
const axios = require('axios')
const config = {
  gitBaseUrls: ['https://gitlab.netsgw.com','https://gitlab.nets.com.sg'],
  gitDefaultUsername: 'chrisrothwell@nets.com.sg',
  gitDefaultPassword: 'TwTyJw9F6jd6enX',
  gitResultsPerPage: 100,
  gitFieldsToSave: ['id','path_with_namespace','created_at','web_url','last_activity_at'],
  jenkinsfileVariablesToSave: ['ProjectName', 'mainjar', 'artifactrepo', 'sonarAnalyze']
}


async function cli() {
  //Select GIT instance and set URLs  
  let selBaseURL = await cliSelect({  values: config.gitBaseUrls})
  const giturls = {
    token: selBaseURL.value + '/oauth/token',
    projects: selBaseURL.value + '/api/v4/projects',
    jenkinsfile: '/repository/files/Jenkinsfile?ref=release',
    jenkinsfile_raw: '/repository/files/Jenkinsfile/raw?ref=release'
  }
   
  // Login
  let credSchema = {
    properties: {
      username: {
        default: config.gitDefaultUsername,
        required: true
      },
      password: {
        default: config.gitDefaultPassword,
        hidden: true,
        required: true
      }
    }
  };

  prompt.start();
  
  let creds = await prompt.get(credSchema)
  let accessToken

  try {
    loginToken = await axios.post(giturls.token, {
      grant_type: "password",
      username: creds.username,
      password: creds.password  
    })
    accessToken = loginToken.data.access_token
    console.log('Successfully obtained access token!')
  } catch (e) {
    console.log('Unable to login, only public data will be returned.')
    console.error('Error', e)
  }
  
  //Get Project List (GITLAB)
  
  let prjPage = 1
  let prjResults = []
  
  console.log('Calling',giturls.projects)

  do {
    thisResult = await axios.get(giturls.projects, {
      headers: {
        'Authorization': 'Bearer ' + accessToken
      },
      params: {
        per_page: config.gitResultsPerPage,
        page: prjPage
      }
    })
    prjResults.push(thisResult.data)
    prjPage++
  } while (thisResult.data.length)

  prjResults.pop() //get rid of the last result which will be empty
  console.log(`Fetched ${prjResults.length} page(s) of results (max ${config.gitResultsPerPage} per page)`)

  let projects = {}

  for (const page in prjResults) {
    console.log('Page',page,'has',prjResults[page].length,'projects.')
    for (const prj in prjResults[page]) {
      let eachProject = {
        'gitlab': {},
        'jenkins': {}
      }

      // Iterate through GitLab projects
      let thisGit = {}
      for (const gitField of config.gitFieldsToSave) {
        thisGit[gitField] = prjResults[page][prj][gitField]
      }
      // Check Jenkinsfile
      try {
        thisResult = await axios.get(`${giturls.projects}/${thisGit.id}${giturls.jenkinsfile}`, {
          headers: {
            'Authorization': 'Bearer ' + accessToken
          }
        })
        thisGit.jenkinsfile_commit_id = thisResult.data.commit_id
      } catch(err) {
        thisGit.jenkinsfile_commit_id = `No jenkinsfile found (${err.response.status})`
      }
      

      // Read Jenkinsfile
      let thisJenkinsFile = {}
      try {
        thisResult = await axios.get(`${giturls.projects}/${thisGit.id}${giturls.jenkinsfile_raw}`, {
          headers: {
            'Authorization': 'Bearer ' + accessToken
          }
        })
        for (const jkVar of config.jenkinsfileVariablesToSave) {
          thisJenkinsFile[jkVar] = thisResult.data.substr(thisResult.data.search(jkVar),50).split('=')[1].split(/\r?\n/)[0].replace(/[ '"]/g,'').trim()
        }
      } catch(err) {
        thisJenkinsFile.cerr = `No jenkinsfile found (${err.response.status})`
      }
      
      eachProject.gitlab = thisGit
      eachProject.jenkinsfile = thisJenkinsFile
      projects[thisGit.path_with_namespace] = eachProject
    }
  }

  // TODO
  // Check projects in Jenkins (last build time, success?)
  // Get Artifact repo from Jenkinsfile (may not be necessary)
  // Check if Fortify is enabled (env variable?)
  // Check if present in Sonarqube
  // Check if present in Nexus Lifecycle
  // Check if present in Artifactory


  console.log(projects)
}

/* The output object will look like this...
  {
    project1: {
      gitlab: {
        'path_with_namespace': '',
        'created_at': '',
        'web_url': '',
        'last_activity_at': ''
      },
      jenkins {
        ...
      }
    },
    project2: {
      gitlab: {
        'path_with_namespace': '',
        'created_at': '',
        'web_url': '',
        'last_activity_at': ''
      },
      jenkins: {
        'some key': 'some value'
      }
    }
  }

*/
cli();


