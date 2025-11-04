#!/bin/bash
# Script de rotación de credenciales
# Genera nuevas contraseñas y actualiza los servicios

set -e

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

echo -e "${YELLOW}=== Rotación de Credenciales ETL ===${NC}"
echo "Fecha: $(date '+%Y-%m-%d %H:%M:%S')"
echo ""

# Verificar que se ejecuta como root o con sudo
if [ "$EUID" -ne 0 ]; then 
    echo -e "${RED}Este script debe ejecutarse como root o con sudo${NC}"
    exit 1
fi

# Función para generar contraseña segura
generate_password() {
    openssl rand -base64 32 | tr -d "=+/" | cut -c1-25
}

# Confirmar acción
read -p "¿Deseas rotar las credenciales? (s/N): " confirm
if [ "$confirm" != "s" ] && [ "$confirm" != "S" ]; then
    echo "Operación cancelada"
    exit 0
fi

echo ""
echo -e "${YELLOW}Generando nuevas contraseñas...${NC}"

# Generar nuevas contraseñas
NEW_POSTGRES_PASSWORD=$(generate_password)
NEW_MSSQL_PASSWORD=$(generate_password)

echo -e "${GREEN}✓ Contraseñas generadas${NC}"
echo ""

# Backup del archivo .env actual
if [ -f "../.env" ]; then
    BACKUP_FILE="../.env.backup.$(date +%Y%m%d_%H%M%S)"
    cp ../.env "$BACKUP_FILE"
    echo -e "${GREEN}✓ Backup creado: $BACKUP_FILE${NC}"
fi

# Actualizar PostgreSQL
echo -e "${YELLOW}Actualizando PostgreSQL...${NC}"
docker exec marcador-postgres psql -U postgres -c "ALTER ROLE etl_writer WITH PASSWORD '$NEW_POSTGRES_PASSWORD';" 2>/dev/null
if [ $? -eq 0 ]; then
    echo -e "${GREEN}✓ Contraseña de PostgreSQL actualizada${NC}"
else
    echo -e "${RED}✗ Error actualizando PostgreSQL${NC}"
    exit 1
fi

# Actualizar SQL Server (si es posible)
echo -e "${YELLOW}Actualizando SQL Server...${NC}"
docker exec marcador-sqlserver /opt/mssql-tools/bin/sqlcmd -S localhost -U sa -P "$MSSQL_SA_PASSWORD" -Q "ALTER LOGIN etl_user WITH PASSWORD = '$NEW_MSSQL_PASSWORD';" 2>/dev/null
if [ $? -eq 0 ]; then
    echo -e "${GREEN}✓ Contraseña de SQL Server actualizada${NC}"
else
    echo -e "${YELLOW}⚠ No se pudo actualizar SQL Server automáticamente${NC}"
    echo -e "${YELLOW}  Actualiza manualmente con: ALTER LOGIN etl_user WITH PASSWORD = 'nueva_password';${NC}"
fi

# Actualizar archivo .env
echo -e "${YELLOW}Actualizando archivo .env...${NC}"
if [ -f "../.env" ]; then
    # Actualizar POSTGRES_PASSWORD
    sed -i.tmp "s/POSTGRES_PASSWORD=.*/POSTGRES_PASSWORD=$NEW_POSTGRES_PASSWORD/" ../.env
    
    # Actualizar MSSQL_PASSWORD
    sed -i.tmp "s/MSSQL_PASSWORD=.*/MSSQL_PASSWORD=$NEW_MSSQL_PASSWORD/" ../.env
    
    # Actualizar connection strings
    sed -i.tmp "s/PWD=[^;]*;/PWD=$NEW_MSSQL_PASSWORD;/" ../.env
    sed -i.tmp "s/password=[^ ]*/password=$NEW_POSTGRES_PASSWORD/" ../.env
    
    rm -f ../.env.tmp
    echo -e "${GREEN}✓ Archivo .env actualizado${NC}"
else
    echo -e "${RED}✗ Archivo .env no encontrado${NC}"
    exit 1
fi

# Reiniciar servicio ETL
echo -e "${YELLOW}Reiniciando servicio ETL...${NC}"
cd ..
docker-compose restart etl
if [ $? -eq 0 ]; then
    echo -e "${GREEN}✓ Servicio ETL reiniciado${NC}"
else
    echo -e "${RED}✗ Error reiniciando servicio ETL${NC}"
    exit 1
fi

# Verificar conexión
echo -e "${YELLOW}Verificando conexiones...${NC}"
sleep 5
docker logs marcador-etl --tail 20 | grep -i "error\|failed" > /dev/null
if [ $? -eq 0 ]; then
    echo -e "${RED}✗ Se detectaron errores en los logs${NC}"
    echo -e "${YELLOW}Revisa los logs con: docker logs marcador-etl${NC}"
    echo -e "${YELLOW}Si hay problemas, restaura el backup: cp $BACKUP_FILE ../.env${NC}"
else
    echo -e "${GREEN}✓ Conexiones verificadas${NC}"
fi

echo ""
echo -e "${GREEN}╔════════════════════════════════════════════════════════╗${NC}"
echo -e "${GREEN}║  ✓ Rotación de credenciales completada exitosamente   ║${NC}"
echo -e "${GREEN}╚════════════════════════════════════════════════════════╝${NC}"
echo ""
echo -e "${YELLOW}IMPORTANTE:${NC}"
echo "1. Guarda las nuevas credenciales en un gestor de contraseñas"
echo "2. Actualiza la documentación si es necesario"
echo "3. Notifica al equipo sobre el cambio"
echo "4. El backup está en: $BACKUP_FILE"
echo ""
echo -e "${YELLOW}Nuevas credenciales (guárdalas de forma segura):${NC}"
echo "PostgreSQL etl_writer: $NEW_POSTGRES_PASSWORD"
echo "SQL Server etl_user: $NEW_MSSQL_PASSWORD"
echo ""
