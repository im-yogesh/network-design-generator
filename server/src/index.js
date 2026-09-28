import app from './app.js';

app.listen(process.env.PORT, () => console.log(`API on :${process.env.PORT}`));
