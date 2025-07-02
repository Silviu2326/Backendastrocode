# Backend Generado Automáticamente

Este backend fue generado automáticamente mediante análisis de archivos API usando IA.

## Características

- **Framework**: express
- **Base de datos**: MongoDB con Mongoose
- **Archivos generados**: 74

## Estructura del Proyecto

```
├── models/          # Modelos de datos
├── controllers/     # Lógica de negocio
├── routes/          # Definición de rutas
├── middleware/      # Middleware personalizado
├── config/          # Configuraciones
├── server.js        # Archivo principal
├── package.json     # Dependencias
└── README.md        # Este archivo
```

## Instalación

1. Instalar dependencias:
```bash
npm install
```

2. Configurar variables de entorno:
```bash
cp .env.example .env
# Editar .env con tus configuraciones
```

3. Asegúrate de tener MongoDB ejecutándose

## Ejecución

### Desarrollo
```bash
npm run dev
```

### Producción
```bash
npm start
```

## Archivos Generados


### Models

- **curso.model.js**: Este modelo de Mongoose, llamado 'Curso', define la estructura para almacenar las analíticas de los cursos. Utiliza un enfoque de subdocumentos, donde un esquema secundario 'leccionSchema' se incrusta dentro del 'cursoSchema' principal. Este diseño es eficiente para datos que se acceden y se gestionan juntos. El modelo incluye validaciones de datos (campos obligatorios, valores mínimos, etc.) para garantizar la integridad de la información en MongoDB. Cabe destacar que el manejo de errores de operaciones asíncronas (try/catch) y la gestión de respuestas HTTP pertenecen a la capa de 'Controladores' en una arquitectura MVC, mientras que el modelo se centra exclusivamente en la forma y las reglas de los datos.
- **configuracion.model.js**: Modelo de Mongoose para la entidad 'Configuracion'. Define la estructura de datos para almacenar las preferencias y configuraciones de cada usuario en la base de datos MongoDB. Incluye validaciones de datos, valores por defecto, sub-documentos para accesibilidad y notificaciones, y una referencia obligatoria al modelo 'User' para asociar cada configuración a un usuario específico. Utiliza timestamps para el control automático de fechas de creación y actualización.
- **curso.model.js**: Modelo principal que define la estructura de un Curso. Utiliza referencias (ObjectId) para relacionarse con sus Lecciones, Recursos y publicaciones del Foro, promoviendo un diseño escalable. Incluye validaciones de datos y un hook `pre-remove` para eliminar en cascada los documentos relacionados y mantener la integridad de la base de datos.
- **leccion.model.js**: Modelo para las Lecciones de un curso. Implementa un diseño polimórfico con validación condicional para campos como `videoUrl`, `contenido` e `instrucciones` basado en el `tipo` de lección. Cada lección mantiene una referencia a su curso padre.
- **recurso.model.js**: Modelo para los Recursos asociados a un curso. Incluye validación de datos para la `url` del recurso mediante una expresión regular y mantiene una referencia a su curso padre para asegurar la integridad relacional.
- **foro.model.js**: Modelo para las publicaciones del Foro de un curso. La fecha de publicación se gestiona automáticamente con `timestamps`. Se incluye una nota sobre cómo el campo `autor` se mejoraría en una aplicación real referenciando a un modelo de Usuario. Cada publicación está vinculada a su curso.
- **curso.model.js**: Modelo principal para los cursos. Define la estructura de datos de un curso, incluyendo validaciones y un sub-esquema para las lecciones que componen el temario. Este modelo es la representación en la base de datos (MongoDB) de un curso de la plataforma.
- **flashcardSet.model.js**: Modelo de Mongoose para gestionar los conjuntos de Flashcards (FlashcardSet). Incluye un sub-esquema para las tarjetas individuales (Card) que se encuentran embebidas. El modelo principal contiene validaciones de datos (campos requeridos, únicos y personalizados), un campo virtual para el conteo total de tarjetas y timestamps automáticos (`createdAt`, `updatedAt`) para el seguimiento de los registros.
- **curso.model.js**: Modelo de Mongoose para la entidad 'Curso'. Este modelo define la estructura completa de un temario, incluyendo metadatos como título, nivel y duración, así como una estructura jerárquica de 'bloques' y 'lecciones'. Incluye validaciones de datos para garantizar la integridad de la información y utiliza sub-esquemas para organizar el contenido anidado. Está diseñado para ser almacenado en una colección de MongoDB.
- **course.model.js**: Este modelo representa un curso en la plataforma de e-learning. Incluye validaciones de datos para asegurar la integridad de la información, como campos obligatorios (título, instructor), valores enumerados (nivel) y rangos numéricos (rating). Los timestamps automáticos ayudan a rastrear cuándo se creó o actualizó un curso.
- **achievement.model.js**: Este modelo define los logros (medallas, insignias) que los usuarios pueden ganar. Separarlo en su propio modelo permite una gestión centralizada y fácil de los logros disponibles en la plataforma, en lugar de duplicar esta información para cada usuario.
- **user.model.js**: Este modelo es el más complejo y central, representando a un usuario de la plataforma. Almacena no solo datos de autenticación (email, password), sino también sus estadísticas de progreso. Utiliza referencias a los modelos 'Course' y anida un esquema 'userAchievementSchema' para rastrear el progreso individual en cada logro. Esto crea una estructura de datos normalizada y escalable.
- **integracion.model.js**: Este modelo de Mongoose define la entidad 'Integracion'. Representa la conexión específica de un usuario con un servicio externo (como Notion, Slack, etc.). Almacena el estado, la configuración personalizada, los permisos y las credenciales seguras de dicha conexión. Incluye una referencia al modelo 'User' y un índice único compuesto (`usuario`, `conectorId`) para garantizar que cada usuario solo pueda tener una instancia por cada tipo de integración, previniendo así datos duplicados.
- **leccion.model.js**: Modela una 'Lección' que actúa como un contenedor para agrupar ejercicios. Incluye validaciones para asegurar la integridad de los datos, como campos obligatorios y únicos.
- **ejercicio.model.js**: Modela un 'Ejercicio'. Utiliza un diseño polimórfico con validación condicional basada en el campo 'tipo'. Si es 'codigo', requiere campos como `solucionEsperada`. Si es 'formulario', requiere un array de `campos` definidos en un sub-esquema.
- **submission.model.js**: Modela un 'Submission' (Envío o Intento), que representa el historial de intentos de un usuario. Vincula un usuario, un ejercicio y una lección, y almacena la respuesta del usuario y si fue correcta. Está optimizado para consultas con índices.
- **curso.model.js**: Modelo de datos para los cursos del marketplace. Incluye validaciones estrictas para cada campo, como tipo, obligatoriedad, longitud y valores permitidos (enum). Utiliza los timestamps de Mongoose para gestionar automáticamente las fechas de creación y actualización. Incorpora campos virtuales ('esPremium', 'esGratis') que se calculan dinámicamente a partir del precio, evitando redundancia en la base de datos.
- **historialAccion.model.js**: Modelo de datos para registrar el historial de acciones de los usuarios. Está diseñado para ser un log de auditoría o de comportamiento. Contiene referencias a los modelos 'Usuario' y 'Curso', asumiendo su existencia. Utiliza un campo 'enum' para estandarizar los tipos de acciones y un campo flexible ('detalles') para almacenar metadatos relevantes a cada acción.
- **user.model.js**: Este modelo define la estructura completa del perfil de un usuario para ser utilizado con Mongoose en una base de datos MongoDB. Consolida la información personal, los intereses, el nivel de conocimiento, las preferencias de aprendizaje y las configuraciones de personalización en una única entidad para mayor eficiencia y coherencia. Incluye validaciones de datos, valores por defecto y sigue las mejores prácticas de seguridad y modelado.
- **usuario.model.js**: Modelo central que representa a un usuario. Incluye datos personales, validaciones de email, y subdocumentos embebidos para estadísticas y suscripción. También contiene un array de los cursos en los que está inscrito (con su progreso individual) y referencias a su historial de actividades.
- **curso.model.js**: Modelo para la entidad Curso. Contiene la información general y canónica de un curso, como su título y descripción. El progreso de un usuario en este curso se gestiona en el modelo 'Usuario' para mantener la separación de responsabilidades.
- **historial.model.js**: Modelo para registrar el historial de actividades de un usuario. Se separa en su propia colección para evitar que los documentos de usuario crezcan demasiado. Cada entrada está vinculada a un usuario mediante una referencia y un índice para optimizar las consultas.
- **planEstudio.model.js**: Modela la entidad principal 'PlanEstudio'. Utiliza esquemas anidados para 'Semana' y 'Actividad', lo cual es eficiente para datos que se consultan juntos. Incluye validaciones de datos y un campo virtual 'progreso' que se calcula al momento de la consulta para mantener la integridad de los datos.
- **usuario.model.js**: Modela la entidad 'Usuario', que es fundamental para contextualizar el plan de estudio. Almacena una referencia al 'PlanEstudio' activo y contiene un esquema anidado para la 'disponibilidad' semanal del usuario, tal como lo requiere la función `generateStudyCalendar`. Incluye validaciones para los datos del usuario, como el formato del email.
- **progresoUsuario.model.js**: Modela el progreso general y las estadísticas agregadas de un usuario en la plataforma. Centraliza métricas como la racha, horas de estudio y los logros obtenidos. Se relaciona 1 a 1 con un Usuario.
- **inscripcion.model.js**: Modela la relación entre un Usuario y un Curso. Rastrea el progreso individual de un usuario en un curso específico, como el porcentaje completado y su estado actual (ej: en progreso, completado).
- **curso.model.js**: Modela la entidad principal de un curso. Contiene información genérica y estática como el título y la descripción, que es la misma para todos los usuarios.
- **logro.model.js**: Modela un logro o badge que los usuarios pueden obtener. Define las propiedades del logro como su nombre, descripción y el criterio necesario para desbloquearlo.
- **conversationModel.js**: Modela el historial de interacciones entre un usuario y el tutor de IA. Cada documento es un par de pregunta-respuesta, vinculado a un usuario y una lección específica.
- **tutorResponseModel.js**: Modela la base de conocimiento del tutor. Cada documento representa una respuesta predefinida con su texto y audio opcional, asociada a una lección o tema específico.
- **curso.model.js**: Este modelo Mongoose define el esquema para la entidad 'Curso'. Representa un curso en la plataforma. Incluye validaciones de datos directamente en el esquema (campos obligatorios, enumeraciones para el nivel, límites para la calificación, formato de URL para la miniatura). Estas validaciones son la primera capa de manejo de errores, asegurando la integridad de los datos antes de que se guarden en MongoDB. El manejo de errores de lógica de negocio y las respuestas HTTP (ej. 400 Bad Request si falla la validación) deben ser implementados en la capa del Controlador, que es donde se utilizan los métodos asíncronos (con `async/await`) de este modelo para interactuar con la base de datos (ej. `await Curso.create(datos)`).
- **testimonio.model.js**: Este modelo Mongoose define el esquema para la entidad 'Testimonio'. Representa la opinión de un usuario sobre la plataforma. Implementa validaciones estrictas para asegurar la calidad de los datos, como campos requeridos, longitud máxima para la cita y un rango para la calificación. El esquema se encarga de la validación a nivel de datos. La lógica para capturar los errores de validación de Mongoose y devolver respuestas HTTP apropiadas (como un 400 o 422) pertenece a la capa de Controladores/Servicios, que utilizará este modelo de forma asíncrona (`async/await`).
- **tema.model.js**: Este modelo define la estructura para un 'Tema' en la base de datos MongoDB usando Mongoose. Incluye validaciones de datos como campos requeridos y únicos. La estructura anidada de 'bloquesAdicionales' se maneja eficientemente a través de un sub-documento, asegurando la integridad de los datos. El modelo está optimizado con timestamps automáticos y la desactivación de la 'versionKey' para mantener los documentos limpios y seguir las mejores prácticas.

### Controllers

- **analyticsController.js**: Controlador que maneja la lógica de negocio para las analíticas de cursos. Expone funciones para obtener una lista de todos los cursos con sus analíticas y para obtener las métricas detalladas de un curso específico por su ID, siguiendo las mejores prácticas de Express.js.
- **configuracionController.js**: Controlador para gestionar la configuración global de un usuario. Incluye funciones para obtener y actualizar la configuración, con validación de datos, manejo de errores y lógica de negocio para interactuar con la base de datos. Asume que un middleware de autenticación provee el ID del usuario en `req.user.id`.
- **courseController.js**: Controlador para gestionar las operaciones del recurso 'Curso'. Se encarga de obtener la información detallada de un curso específico. Sigue un patrón RESTful para la obtención de un recurso por su ID.
- **lessonController.js**: Controlador para las operaciones del recurso 'Lección'. Se encarga de actualizar el estado de una lección y de obtener su contenido detallado. Separa la lógica de las lecciones de la del curso principal para una mejor organización.
- **cursoController.js**: Controlador para gestionar las operaciones de los cursos. Incluye funciones para obtener todos los cursos públicos (con filtros), obtener un curso por su ID, y las operaciones CRUD (crear, actualizar, eliminar) que serían para uso administrativo. Implementa manejo de errores completo, validación de datos y respuestas HTTP estándar.
- **flashcardController.js**: Este controlador maneja toda la lógica de negocio (CRUD) para los sets de flashcards y las tarjetas individuales contenidas en ellos. Simula una base de datos en memoria para demostrar las operaciones, incluye validaciones de datos, manejo de errores y respuestas HTTP semánticas, siguiendo patrones RESTful.
- **temario.controller.js**: Controlador que centraliza la lógica para las rutas de la API de Temarios. Se encarga de recibir las peticiones HTTP, validar los datos de entrada, invocar la lógica de negocio correspondiente (separada en servicios) y formular las respuestas HTTP adecuadas, incluyendo un manejo de errores robusto.
- **cursoController.js**: Controlador para gestionar las operaciones relacionadas con los cursos, como obtener la lista de cursos destacados y generar cursos de demostración basados en un tema.
- **usuarioController.js**: Controlador para gestionar las operaciones del perfil de usuario. Actualmente, incluye la obtención de las estadísticas de progreso del usuario autenticado.
- **integracionController.js**: Controlador para gestionar todas las operaciones relacionadas con las integraciones externas. Incluye funciones para listar, obtener, conectar, desconectar, probar y sincronizar conectores, aplicando lógica de negocio, validación de datos y manejo de errores.
- **laboratorioController.js**: Este controlador gestiona toda la lógica de negocio para el Laboratorio Interactivo. Se encarga de servir los ejercicios por lección o por ID, y de recibir, procesar y evaluar los intentos enviados por los usuarios. Incluye validación de datos y manejo de errores.
- **cursosController.js**: Controlador que gestiona todas las operaciones CRUD (Crear, Leer, Actualizar, Eliminar) para el recurso 'cursos'. Sigue los principios RESTful y se encarga de manejar las peticiones HTTP, validar entradas y enviar respuestas adecuadas al cliente. La lógica de negocio y acceso a datos se delega a la capa de servicios (cursoService).
- **historialController.js**: Controlador dedicado a gestionar las operaciones relacionadas con el historial de acciones del usuario. En este caso, solo expone un endpoint para consultar el historial, asumiendo que el registro de nuevas acciones se realiza internamente desde otros servicios o controladores para mantener la integridad de los datos.
- **perfilPreferenciasController.js**: Controlador que gestiona todas las operaciones relacionadas con el perfil del usuario, incluyendo datos personales, intereses, preferencias de aprendizaje y configuración de personalización. Sigue las mejores prácticas de Express y RESTful.
- **perfilUsuarioController.js**: Controlador para gestionar las operaciones del perfil de usuario. Implementa la lógica para obtener el perfil completo y para actualizarlo, basándose en los datos del archivo proporcionado. Sigue las mejores prácticas de Express, como el uso de async/await, manejo de errores centralizado con `next()`, validación de entradas y respuestas HTTP semánticas (200, 400, 404). La lógica de negocio está simulada para demostrar cómo el controlador interactuaría con una capa de servicio.
- **planEstudioController.js**: Controladores para gestionar los planes de estudio. Incluye obtener un plan por ID, actualizar el estado de una actividad y generar un calendario de estudio dinámico basado en la disponibilidad del usuario. Sigue patrones RESTful y las mejores prácticas de Express, como la validación de entradas y el manejo de errores centralizado.
- **progressController.js**: Controlador que gestiona todas las operaciones relacionadas con el progreso de un usuario, como obtener resúmenes, estadísticas, logros y registrar actividad. Implementa manejo de errores, validación de datos y respuestas HTTP estándar.
- **tutorController.js**: Este controlador gestiona las interacciones con el tutor de IA. Incluye la lógica para recibir preguntas de los usuarios, validarlas, y generar respuestas simuladas basadas en el tema de la lección proporcionada. Implementa manejo de errores y sigue las mejores prácticas para controladores en una API RESTful.
- **cursoController.js**: Controlador que gestiona toda la lógica de negocio (CRUD) para los recursos de Cursos. Utiliza datos simulados y sigue las mejores prácticas de API RESTful, incluyendo manejo de errores y validaciones.
- **testimonioController.js**: Controlador que gestiona toda la lógica de negocio (CRUD) para los recursos de Testimonios. Incluye validaciones específicas para campos como 'rating' y sigue un patrón RESTful.
- **temarioController.js**: Controlador para gestionar la información de los temarios. Expone endpoints para obtener la lista de todos los temas, los detalles completos de un tema específico, y partes concretas como prerrequisitos, sugerencias y bloques de contenido adicional.

### Routes

- **analytics.routes.js**: Este archivo define las rutas para el API de analíticas. Se encarga de mapear los endpoints HTTP a los controladores correspondientes, incluyendo validaciones para los parámetros de entrada y siguiendo las mejores prácticas RESTful. Se basa en los métodos `obtenerCursosCreados` y `obtenerMetricasCurso` del archivo de frontend analizado.
- **configuracion.routes.js**: Archivo de rutas para gestionar la configuración global de los usuarios. Define los endpoints RESTful para obtener (GET) y actualizar (PATCH) las configuraciones, incorporando middlewares de validación de datos con express-validator y asumiendo un middleware de autenticación para proteger las rutas.
- **curso.routes.js**: Define las rutas RESTful para la gestión de cursos y lecciones. Incluye endpoints para obtener un curso por su ID, obtener los detalles de una lección específica y actualizar el estado de una lección. Implementa validación de datos de entrada para los parámetros de la URL y el cuerpo de la solicitud utilizando 'express-validator' y un manejo de errores centralizado para las validaciones.
- **explorarCursos.routes.js**: Define las rutas RESTful para la API 'ExplorarCursos'. Permite listar todos los cursos públicos y obtener los detalles de un curso específico por su ID. Incluye middlewares para la validación de parámetros (ID del curso) y un patrón de manejo de errores asíncronos para garantizar la robustez de los endpoints.
- **flashcardRoutes.js**: Rutas para la gestión de conjuntos de flashcards y sus tarjetas individuales. Sigue los principios RESTful, utiliza async/await en los controladores (no visibles aquí), incluye middleware de validación con 'express-validator' para los parámetros de ruta y el cuerpo de la solicitud, y está diseñado para un manejo de errores y respuestas HTTP apropiadas.
- **temario.routes.js**: Este archivo define las rutas de la API para la gestión de temarios utilizando Express.js. Implementa el patrón RESTful para la creación (POST) y consulta (GET) de recursos. Incluye middlewares de validación robustos con 'express-validator' para asegurar la integridad de los datos de entrada y un manejo de errores centralizado para respuestas HTTP consistentes y predecibles. Las rutas están diseñadas para ser consumidas por los controladores correspondientes, que contendrían la lógica de negocio.
- **inicio.routes.js**: Este archivo define las rutas de la API para la sección 'Inicio' de la aplicación utilizando Express.js. Gestiona los endpoints para obtener cursos destacados, estadísticas de usuario (simulando autenticación) y generar un curso de demostración. Incluye validación de datos de entrada para la creación de cursos y sigue las mejores prácticas de enrutamiento, separando la lógica en controladores (no incluidos).
- **integraciones.routes.js**: Este archivo define las rutas de la API para gestionar las integraciones externas. Incluye endpoints para listar, ver detalles, actualizar configuración (conectar/desconectar), probar y sincronizar conectores, aplicando validaciones de datos y siguiendo patrones RESTful.
- **laboratorio.routes.js**: Este archivo define las rutas RESTful para el API del Laboratorio. Utiliza express.Router para modularizar las rutas. Incluye validación de entradas (parámetros de ruta, queries y cuerpo de la solicitud) usando 'express-validator'. Las rutas están diseñadas para obtener listas de ejercicios, obtener un ejercicio específico, enviar soluciones y consultar el historial de intentos, delegando la lógica de negocio a los controladores correspondientes.
- **marketplace.routes.js**: Archivo de rutas para la API del Marketplace. Define los endpoints para gestionar cursos y consultar el historial de acciones. Implementa el patrón RESTful, utiliza express-validator para la validación de datos en las rutas POST y PUT, y está estructurado para trabajar con controladores que contienen la lógica de negocio, promoviendo un código limpio y modular.
- **profileRoutes.js**: Este archivo define las rutas RESTful para gestionar el perfil, las preferencias y la personalización de un usuario. Utiliza `express.Router` para encapsular las rutas. Incluye endpoints para obtener (GET), actualizar de forma completa (PUT) y parcial (PATCH) los datos. Cada ruta está protegida por middlewares de validación de datos de entrada (`express-validator`) para garantizar la integridad de la información antes de llegar a los controladores. El código sigue las mejores prácticas, como el uso de `async/await` para operaciones asíncronas y un manejo de errores que delega a un middleware centralizado.
- **perfilUsuario.routes.js**: Este archivo define las rutas RESTful para la gestión de perfiles de usuario. Incluye dos endpoints principales: uno para obtener el perfil del usuario actualmente autenticado ('/me') y otro para buscar el perfil de un usuario específico por su ID ('/:userId'). Se implementan middlewares de autenticación para proteger las rutas y de validación (usando express-validator) para asegurar la integridad de los datos de entrada como el 'userId'.
- **planEstudio.routes.js**: Este archivo define las rutas de la API para gestionar los planes de estudio utilizando Express Router y siguiendo principios RESTful. Incluye endpoints para obtener un plan de estudio por ID (GET), actualizar el estado de una actividad (PATCH) y generar un calendario de estudio personalizado (POST). Cada ruta incorpora middleware de validación de datos con 'express-validator' para asegurar la integridad de las solicitudes antes de pasarlas a los controladores.
- **progreso.routes.js**: Este archivo define las rutas RESTful para gestionar toda la información relacionada con el progreso del usuario. Se utilizan middlewares para validación de datos de entrada (con express-validator) y para la gestión centralizada de errores de validación. Las rutas están diseñadas para ser consumidas por un frontend y siguen las mejores prácticas, como la separación de responsabilidades, delegando la lógica de negocio a los controladores. Se asume que en el archivo principal de la aplicación (ej. app.js) se define el prefijo base, por ejemplo: `app.use('/api/progreso', progresoRoutes);`.
- **tutor.routes.js**: Este archivo define las rutas para la API del 'Tutor'. Incluye un endpoint principal `POST /api/tutor/preguntar` que está protegido y validado. Se encarga de recibir las preguntas de los usuarios, aplicar middlewares de autenticación, limitación de tasa y validación de datos antes de pasar la solicitud al controlador correspondiente para ser procesada.
- **cursos.routes.js**: Define las rutas RESTful para el recurso 'Cursos'. Incluye endpoints para obtener, crear, actualizar y eliminar cursos. Implementa validación de datos con `express-validator` para los parámetros de ruta y el cuerpo de la solicitud, y un manejo de errores robusto para operaciones asíncronas.
- **testimonios.routes.js**: Define las rutas RESTful para el recurso 'Testimonios'. Implementa endpoints para todas las operaciones CRUD (Crear, Leer, Actualizar, Eliminar). Incluye validación de datos para garantizar la integridad de la información y manejo de errores para las operaciones asíncronas.
- **temarioRoutes.js**: Define las rutas de la API para consultar la información de los temarios. Implementa un endpoint GET '/:tema' para obtener los prerrequisitos, sugerencias y bloques adicionales de un tema específico. Incluye validación de parámetros de entrada con express-validator, manejo completo de errores con bloques try-catch, y respuestas HTTP RESTful (200, 400, 404).

### Configs

- **package.json**: Configuración de dependencias del proyecto
- **server.js**: Archivo principal del servidor

## Notas Importantes

- Este código fue generado automáticamente y puede requerir ajustes
- Revisa y prueba todas las funcionalidades antes de usar en producción
- Agrega validaciones adicionales según tus necesidades
- Configura adecuadamente las variables de entorno

## Health Check

Una vez ejecutando, puedes verificar el estado del servidor en:
```
GET http://localhost:3000/health
```

---

*Generado automáticamente el 20/6/2025, 21:33:39*