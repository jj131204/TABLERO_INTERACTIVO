import { defineConfig } from 'vite';
import fs from 'fs';
import path from 'path';

// Helper to parse JSON body from request without external dependencies
function getRequestBody(req) {
  return new Promise((resolve, reject) => {
    let body = '';
    req.on('data', chunk => { body += chunk.toString(); });
    req.on('end', () => {
      if (!body) {
        resolve(null);
        return;
      }
      try {
        resolve(JSON.parse(body));
      } catch (err) {
        resolve(body);
      }
    });
    req.on('error', err => reject(err));
  });
}

// Local Database API Plugin
const localDbPlugin = () => {
  const projectsDir = path.resolve(process.cwd(), 'projects');

  // Ensure projects directory exists
  if (!fs.existsSync(projectsDir)) {
    fs.mkdirSync(projectsDir, { recursive: true });
    
    // Create initial demo project
    const demoPath = path.join(projectsDir, 'demo-proyecto.json');
    const demoData = {
      id: 'demo-proyecto',
      name: 'Mi Primer Proyecto',
      activeBoardId: 'root',
      boards: {
        root: {
          id: 'root',
          name: 'Inicio',
          cards: [
            {
              id: 'card-1',
              type: 'note',
              title: '¡Bienvenido a LuminaBoard!',
              content: 'Este es tu lienzo visual local. Puedes crear notas, listas de tareas, añadir imágenes y conectarlo todo mediante líneas. \n\n¡Haz doble clic en cualquier lugar para crear una nota rápida!',
              x: 100,
              y: 120,
              w: 300,
              h: 180,
              color: 'violet'
            },
            {
              id: 'card-2',
              type: 'todo',
              title: 'Lista de Tareas',
              todos: [
                { id: 't1', text: 'Crear mi primer sub-tablero', completed: false },
                { id: 't2', text: 'Arrastrar y soltar tarjetas', completed: true },
                { id: 't3', text: 'Dibujar una línea de conexión', completed: false }
              ],
              x: 450,
              y: 120,
              w: 280,
              h: 220,
              color: 'emerald'
            },
            {
              id: 'card-3',
              type: 'board',
              title: 'Moodboard de Inspiración',
              targetBoardId: 'sub-board-1',
              x: 100,
              y: 350,
              w: 240,
              h: 100,
              color: 'blue'
            }
          ],
          connections: [
            {
              id: 'conn-1',
              from: 'card-1',
              to: 'card-2',
              color: 'hsl(263, 90%, 50%)',
              style: 'dashed'
            }
          ]
        },
        'sub-board-1': {
          id: 'sub-board-1',
          name: 'Moodboard de Inspiración',
          parentId: 'root',
          cards: [
            {
              id: 'card-sub-1',
              type: 'note',
              title: 'Ideas Visuales',
              content: 'Aquí puedes agrupar imágenes de referencia, paletas de colores HSL y enlaces a tus webs favoritas.',
              x: 200,
              y: 150,
              w: 280,
              h: 150,
              color: 'indigo'
            }
          ],
          connections: []
        }
      }
    };
    fs.writeFileSync(demoPath, JSON.stringify(demoData, null, 2), 'utf-8');
  }

  return {
    name: 'local-db-api',
    configureServer(server) {
      server.middlewares.use(async (req, res, next) => {
        // Only handle requests targeting /api/projects
        if (!req.url.startsWith('/api/projects')) {
          return next();
        }

        res.setHeader('Content-Type', 'application/json');

        try {
          const urlParts = req.url.split('/').filter(Boolean); // e.g. ["api", "projects", "some-id", "clone"]
          const method = req.method;

          // Route: GET /api/projects - List all projects
          if (urlParts.length === 2 && method === 'GET') {
            const files = fs.readdirSync(projectsDir);
            const list = files
              .filter(file => file.endsWith('.json'))
              .map(file => {
                const filePath = path.join(projectsDir, file);
                const stats = fs.statSync(filePath);
                try {
                  const content = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
                  return {
                    id: content.id || path.basename(file, '.json'),
                    name: content.name || 'Sin Título',
                    updatedAt: stats.mtime,
                    size: stats.size
                  };
                } catch (e) {
                  return {
                    id: path.basename(file, '.json'),
                    name: path.basename(file, '.json'),
                    updatedAt: stats.mtime,
                    size: stats.size,
                    error: 'Archivo corrupto'
                  };
                }
              })
              .sort((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime());

            res.statusCode = 200;
            res.end(JSON.stringify(list));
            return;
          }

          // Route: POST /api/projects - Create new project
          if (urlParts.length === 2 && method === 'POST') {
            const body = await getRequestBody(req);
            const name = body?.name || 'Nuevo Proyecto';
            const safeName = name.toLowerCase().replace(/[^a-z0-9]/g, '-').replace(/-+/g, '-').substring(0, 30) || 'project';
            const id = `${safeName}-${Date.now()}`;
            const newProjectPath = path.join(projectsDir, `${id}.json`);

            const newProjectData = {
              id,
              name,
              activeBoardId: 'root',
              boards: {
                root: {
                  id: 'root',
                  name: 'Inicio',
                  cards: [],
                  connections: []
                }
              }
            };

            fs.writeFileSync(newProjectPath, JSON.stringify(newProjectData, null, 2), 'utf-8');
            res.statusCode = 201;
            res.end(JSON.stringify(newProjectData));
            return;
          }

          // Route: GET /api/projects/:id - Load specific project
          if (urlParts.length === 3 && method === 'GET') {
            const id = urlParts[2];
            const projectPath = path.join(projectsDir, `${id}.json`);

            if (fs.existsSync(projectPath)) {
              const content = fs.readFileSync(projectPath, 'utf-8');
              res.statusCode = 200;
              res.end(content);
            } else {
              res.statusCode = 404;
              res.end(JSON.stringify({ error: 'Proyecto no encontrado' }));
            }
            return;
          }

          // Route: POST /api/projects/:id - Save specific project
          if (urlParts.length === 3 && method === 'POST') {
            const id = urlParts[2];
            const projectPath = path.join(projectsDir, `${id}.json`);
            const body = await getRequestBody(req);

            if (!body) {
              res.statusCode = 400;
              res.end(JSON.stringify({ error: 'Falta el cuerpo del JSON' }));
              return;
            }

            fs.writeFileSync(projectPath, JSON.stringify(body, null, 2), 'utf-8');
            res.statusCode = 200;
            res.end(JSON.stringify({ success: true }));
            return;
          }

          // Route: DELETE /api/projects/:id - Delete project
          if (urlParts.length === 3 && method === 'DELETE') {
            const id = urlParts[2];
            const projectPath = path.join(projectsDir, `${id}.json`);

            if (fs.existsSync(projectPath)) {
              fs.unlinkSync(projectPath);
              res.statusCode = 200;
              res.end(JSON.stringify({ success: true }));
            } else {
              res.statusCode = 404;
              res.end(JSON.stringify({ error: 'Proyecto no encontrado' }));
            }
            return;
          }

          // Route: POST /api/projects/:id/clone - Clone project
          if (urlParts.length === 4 && urlParts[3] === 'clone' && method === 'POST') {
            const id = urlParts[2];
            const sourcePath = path.join(projectsDir, `${id}.json`);

            if (fs.existsSync(sourcePath)) {
              const content = JSON.parse(fs.readFileSync(sourcePath, 'utf-8'));
              const newId = `${content.id}-copia-${Date.now()}`;
              content.id = newId;
              content.name = `${content.name} (Copia)`;
              const newPath = path.join(projectsDir, `${newId}.json`);

              fs.writeFileSync(newPath, JSON.stringify(content, null, 2), 'utf-8');
              res.statusCode = 201;
              res.end(JSON.stringify(content));
            } else {
              res.statusCode = 404;
              res.end(JSON.stringify({ error: 'Proyecto de origen no encontrado' }));
            }
            return;
          }

          // fallback for unhandled /api/projects routes
          res.statusCode = 404;
          res.end(JSON.stringify({ error: 'Ruta de API no encontrada' }));

        } catch (error) {
          console.error('API Error:', error);
          res.statusCode = 500;
          res.end(JSON.stringify({ error: 'Error del servidor local', details: error.message }));
        }
      });
    }
  };
};

export default defineConfig({
  plugins: [localDbPlugin()],
  server: {
    port: 3000,
    open: true
  }
});
