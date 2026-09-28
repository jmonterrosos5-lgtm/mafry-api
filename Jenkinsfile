pipeline {
    agent any

    tools {
        nodejs 'NodeJS 18'
    }

    environment {
        APP_NAME     = 'mafry-api'
        STAGING_PORT = '3001'
        DOCKER_IMAGE = 'mafry/backend'
        DOCKER_TAG   = "${env.BUILD_NUMBER}"
    }

    options {
        buildDiscarder(logRotator(numToKeepStr: '10'))
        timeout(time: 30, unit: 'MINUTES')
        timestamps()
    }

    stages {

        stage('Checkout') {
            steps {
                echo '=== Obteniendo codigo fuente de GitHub ==='
                checkout scm
                echo "Codigo obtenido correctamente"
            }
        }

        stage('Build') {
            steps {
                echo '=== Instalando dependencias Node.js ==='
                sh 'node --version'
                sh 'npm --version'
                sh 'npm install'
                echo 'Dependencias instaladas correctamente'
            }
        }

        stage('Test') {
            steps {
                echo '=== Ejecutando pruebas unitarias con Jest ==='
                sh 'mkdir -p reports'
                sh 'npm test -- --coverage --coverageDirectory=reports/coverage'
            }
            post {
                always {
                    junit allowEmptyResults: true, testResults: 'junit.xml'
                    echo 'Reporte JUnit publicado en Jenkins'
                }
                success {
                    echo 'Todas las pruebas pasaron'
                }
                failure {
                    echo 'Pruebas fallaron — revisar reporte'
                }
            }
        }

        stage('Deploy Staging') {
            steps {
                echo '=== Desplegando en entorno de staging ==='
                sh """
                    echo "Construyendo imagen Docker: ${DOCKER_IMAGE}:${DOCKER_TAG}"
                    docker build -t ${DOCKER_IMAGE}:${DOCKER_TAG} .
                    docker tag ${DOCKER_IMAGE}:${DOCKER_TAG} ${DOCKER_IMAGE}:staging
                    echo "Imagen Docker construida correctamente"
                """
            }
            post {
                success {
                    echo "Deploy a staging completado — Build #${env.BUILD_NUMBER}"
                }
                failure {
                    echo 'Deploy fallo — revisar logs de Docker'
                }
            }
        }

    }

    post {
        success {
            echo "PIPELINE MAFRY EXITOSO — Build #${env.BUILD_NUMBER}"
        }
        failure {
            echo "PIPELINE MAFRY FALLO — Build #${env.BUILD_NUMBER}"
        }
        always {
            archiveArtifacts artifacts: 'reports/**', allowEmptyArchive: true
        }
        cleanup {
            cleanWs(cleanWhenSuccess: true, cleanWhenAborted: true, cleanWhenFailure: false)
        }
    }
}
