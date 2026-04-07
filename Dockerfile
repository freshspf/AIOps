FROM maven:3.9.9-eclipse-temurin-17 AS build

WORKDIR /app

COPY pom.xml .
COPY src ./src

RUN mvn -q -DskipTests package

FROM eclipse-temurin:17-jre

WORKDIR /app

COPY --from=build /app/target/super-biz-agent-*.jar /app/app.jar
COPY deploy/application-docker.yml /app/config/application.yml

RUN mkdir -p /app/uploads

EXPOSE 9900

ENTRYPOINT ["java", "-Dspring.config.location=file:/app/config/application.yml", "-jar", "/app/app.jar"]
