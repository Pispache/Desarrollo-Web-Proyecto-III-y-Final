# ----------------------------
# Etapa de construcción (build)
# ----------------------------
# Imagen base oficial de .NET SDK 8.0 para compilar y publicar la aplicación.
FROM mcr.microsoft.com/dotnet/sdk:8.0 AS build

# Directorio de trabajo dentro del contenedor para la compilación.
WORKDIR /src

# Restauración cacheable: copiar solo csproj y restaurar
COPY Api.csproj ./
RUN --mount=type=cache,target=/root/.nuget/packages \
    dotnet restore ./Api.csproj

# Copiar el resto del código y publicar
COPY . .
RUN --mount=type=cache,target=/root/.nuget/packages \
    dotnet publish ./Api.csproj -c Release -o /out --no-restore

# ----------------------------
# Etapa de ejecución (runtime)
# ----------------------------
# Imagen base oficial de .NET ASP.NET Core 8.0 para correr la aplicación publicada.
FROM mcr.microsoft.com/dotnet/aspnet:8.0

# Directorio donde se ejecutará la app ya compilada.
WORKDIR /app

# Copia la aplicación publicada desde la etapa build.
COPY --from=build /out .

# Define la URL donde ASP.NET Core escuchará dentro del contenedor.
ENV ASPNETCORE_URLS=http://0.0.0.0:8080

# Expone el puerto 8080 para que la app sea accesible desde fuera del contenedor.
EXPOSE 8080

# Comando de arranque: ejecuta la aplicación .NET.
ENTRYPOINT ["dotnet","Api.dll"]
