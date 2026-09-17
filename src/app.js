require('dotenv').config();
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');

require('./config/db');

const app = express();

app.use(helmet());
app.use(cors());
app.use(express.json());

app.get('/', (req, res) => {
  res.json({ mensaje: 'API MAFRY funcionando', version: '1.0.0' });
});

app.use('/api/auth', require('./routes/auth'));
app.use('/api/clientes', require('./routes/clientes'));
app.use('/api/visitas', require('./routes/visitas'));
app.use('/api/pedidos', require('./routes/pedidos'));
app.use('/api/productos', require('./routes/productos'));
app.use('/api/cobros', require('./routes/cobros'));
app.use('/api/vendedores', require('./routes/vendedores'));

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log('Servidor corriendo en http://localhost:' + PORT);
});

module.exports = app;
