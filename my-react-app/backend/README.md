Before starting make node is installed (node.js on the latest version)
if not install it at - https://nodejs.org/en/download

optional
install git to make sure the code can be pushed and pulled to online repositry.


Installing Dependencies

To install all dependencies for the backend run:

npm install

(node_module)
This will install:
express - Web server framework
cors - resource sharing accross the webpage
bcryptjs - Password hashing-for security(encyption)
dotenv - Environment variable management 
nodemon - Auto-reload during development-keeps webpage updated whenever a chage is made



Website User Feature:

Authentication
- Sign Up - Creating your account
- Login - Using exisiting account to gain access to webpage
- Password Reset - Would use a token system to verify user

User Profile
- Store user name, email and password
- Track login history and attempts
- Account management

Shopping Cart
- Unique cart storage per user email
- Add or remove items from cart
- Save cart data to database (sqlite databse)
- Get cart on next login

Product Listings
- Browse all available produce listings
- View product details (lotnumber, packdate etc)
- Filter and search products
- View only items in stock

Seller Features
- Create new product listings
- Set pricing with a small adjacement range
- Update stock amount
- Edit or delete own listings
- Track lot numbers and pack dates
- Only sellers can manage their own products

Inventory Management
- Real time stock tracking
- Adjust stock quantities
- Mark items out of stock
- View stock history

Loyalty Program
- Track customer purchases
- Earn loyalty rewards
- Discount calculations based on purchase histor

Running the Backend

Development
npm run backend    


dev tool only
npm run start      

The backend runs on url - http://localhost:5000
Sqlite is used to run the backend proccesses like data storage and password verification so on.
