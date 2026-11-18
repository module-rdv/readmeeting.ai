FROM mcr.microsoft.com/dotnet/sdk:10.0 AS build
WORKDIR /src

COPY global.json ./
COPY backend/ backend/

RUN dotnet restore backend/src/ReadMeeting.Api/ReadMeeting.Api.csproj
RUN dotnet publish backend/src/ReadMeeting.Api/ReadMeeting.Api.csproj \
    --configuration Release \
    --no-restore \
    --output /app/publish \
    /p:UseAppHost=false

FROM mcr.microsoft.com/dotnet/aspnet:10.0 AS runtime
WORKDIR /app

EXPOSE 10000

COPY --from=build /app/publish .

USER $APP_UID:1000
ENTRYPOINT ["/bin/sh", "-c", "export ASPNETCORE_URLS=\"http://0.0.0.0:${PORT:-10000}\"; exec dotnet ReadMeeting.Api.dll"]
