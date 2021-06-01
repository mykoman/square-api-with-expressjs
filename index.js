const express = require("express");
require("dotenv");

const app = express();
const PORT = 7000;
app.listen(PORT, () => {
		console.log(`I am running again on port ${PORT}`);
	}
);
