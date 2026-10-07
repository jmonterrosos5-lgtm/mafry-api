// Pipeline CI/CD de MAFRY
// Secretos: se guardan en Jenkins → Credentials (nunca en el código):
//   render-deploy-hook (Secret text) · db-test-url (Secret text)
pipeline {
  agent any
  tools { nodejs 'NodeJS-20' }

  environment {
    NODE_ENV          = 'test'
    TEST_DATABASE_URL = credentials('db-test-url')
  }

  options {
    timestamps()
    timeout(time: 20, unit: 'MINUTES')
    disableConcurrentBuilds()
    buildDiscarder(logRotator(numToKeepStr: '10'))
  }

  stages {
    stage('Checkout') {
      steps {
        checkout scm
        sh 'git log --oneline -5'
      }
    }

    stage('Instalar dependencias') {
      steps {
        // npm ci: instala exactamente lo de package-lock.json (verificado por hash)
        sh 'npm ci'
      }
    }

    stage('Calidad de código (ESLint)') {
      steps { sh 'npm run lint' }
    }

    stage('Auditoría de dependencias') {
      steps {
        // Falla el build si hay vulnerabilidades altas o críticas en producción
        sh 'npm audit --audit-level=high --omit=dev'
      }
    }

    stage('Búsqueda de secretos') {
      steps {
        // Falla si aparece una contraseña o secreto escrito en el código fuente
        sh '''
          if grep -rEn "(password|secret|contrasena)\\s*[:=]\\s*['\\"][^'\\"]{6,}" src/ ; then
            echo "❌ Posible secreto en el código"; exit 1
          fi
          echo "✅ Sin secretos en src/"
        '''
      }
    }

    stage('Pruebas') {
      steps { sh 'npm run test:ci' }
      post {
        always {
          junit 'junit.xml'
          publishHTML([allowMissing: true, alwaysLinkToLastBuild: true, keepAll: true,
                       reportDir: 'coverage/lcov-report', reportFiles: 'index.html', reportName: 'Cobertura'])
        }
      }
    }

    stage('Desplegar a Render') {
      when { branch 'main' }
      environment { RENDER_HOOK = credentials('render-deploy-hook') }
      steps {
        // El hook se usa desde la credencial; Jenkins enmascara su valor en el log
        sh 'curl -fsS -X POST "$RENDER_HOOK" -o /dev/null -w "Render respondió HTTP %{http_code}\\n"'
      }
    }
  }

  post {
    success { echo '✅ Build exitoso' }
    failure { echo '❌ Build fallido — revisar la etapa en rojo' }
    always  { cleanWs() }
  }
}
