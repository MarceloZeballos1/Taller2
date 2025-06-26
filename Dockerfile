# 1. Imagen base de Node.js
FROM node:18

# 2. Establecer el directorio de trabajo dentro del contenedor
WORKDIR /app

# 3. Copiar package.json y package-lock.json
COPY package*.json ./

# 4. Instalar dependencias
RUN npm install

# 5. Copiar el resto del código del proyecto
COPY . .

# 6. Exponer el puerto (debe coincidir con el de tu app, aquí 3000)
EXPOSE 3000

# 7. Comando para iniciar la app
CMD ["node", "index.js"]
