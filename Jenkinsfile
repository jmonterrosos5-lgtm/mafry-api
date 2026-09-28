// ============================================================
//  MAFRY – Pipeline CI/CD
//  Repositorio: https://github.com/jmonterrosos5-lgtm/mafry-api
//  Proyecto:    App Vendedores de Ruta – Industria de Alimentos MAFRY
//  Curso:       DevOps 2 – UMG
//  Equipo:      Josselyn Samayoa (PO) · David Sutuj (SM)
//               Valentín Rodríguez · Francisco Monterroso
// ============================================================
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

        // ══════════════════════════════════════════════════
        // ETAPA 1 – CHECKOUT
        // ══════════════════════════════════════════════════
        stage('Checkout') {
            steps {
                echo '=== Obteniendo código fuente de GitHub ==='
                checkout scm
                echo "✅ Código obtenido — Rama: ${env.GIT_BRANCH ?: 'main'}"
            }
        }

        // ══════════════════════════════════════════════════
        // ETAPA 2 – BUILD
        // ══════════════════════════════════════════════════
        stage('Build') {
            steps {
                echo '=== Instalando dependencias Node.js ==='
                sh 'node --version'
                sh 'npm --version'
                sh 'npm install'
                echo '✅ Dependencias instaladas correctamente'
            }
        }

        // ══════════════════════════════════════════════════
        // ETAPA 3 – TEST
        // ══════════════════════════════════════════════════
        stage('Test') {
            steps {
                echo '=== Ejecutando pruebas unitarias con Jest ==='
                sh 'mkdir -p reports'
                sh 'npm test -- --coverage --coverageDirectory=reports/coverage'
            }
            post {
                always {
                    junit allowEmptyResults: true, testResults: 'junit.xml'
                    echo '📊 Reporte JUnit publicado en Jenkins'
                }
                success {
                    echo '✅ Todas las pruebas pasaron'
                }
                failure {
                    echo '❌ Pruebas fallaron — revisar reporte'
                }
            }
        }

        // ══════════════════════════════════════════════════
        // ETAPA 4 – DEPLOY STAGING
        // ══════════════════════════════════════════════════
        stage('Deploy Staging') {
            steps {
                echo '=== Desplegando en entorno de staging ==='
                echo "🐳 [SIMULADO] docker build -t ${DOCKER_IMAGE}:${DOCKER_TAG} ."
                echo "🐳 [SIMULADO] docker tag ${DOCKER_IMAGE}:${DOCKER_TAG} ${DOCKER_IMAGE}:staging"
                echo "🐳 [SIMULADO] docker run -d -p ${STAGING_PORT}:3000 --name ${APP_NAME}-staging ${DOCKER_IMAGE}:staging"
                echo "✅ Imagen Docker construida y staging listo — Build #${env.BUILD_NUMBER}"
            }
            post {
                success {
                    echo "✅ Deploy a staging completado — Build #${env.BUILD_NUMBER}"
                }
                failure {
                    echo '❌ Deploy falló — revisar logs'
                }
            }
        }

    } // end stages

    post {
        success {
            echo """
╔══════════════════════════════════════════╗
║  ✅  PIPELINE MAFRY – EXITOSO           ║
║  Build #${env.BUILD_NUMBER}              ║
╚══════════════════════════════════════════╝
            """
        }
        failure {
            echo """
╔══════════════════════════════════════════╗
║  ❌  PIPELINE MAFRY – FALLÓ            ║
║  Build #${env.BUILD_NUMBER}              ║
╚══════════════════════════════════════════╝
            """
        }
        always {
            archiveArtifacts artifacts: 'reports/**', allowEmptyArchive: true
        }
        cleanup {
            cleanWs(cleanWhenSuccess: true, cleanWhenAborted: true, cleanWhenFailure: false)
        }
    }
}
