# Local farmer Produce shop 

Website features:
sign in/up, 
listings products for sale, 
cart to save itesms for later, 
checkout purchasing webpage for transactional aspect, 
orders-able to choose from delievery and pickup,
Simple one page gui that contains all needed aspects without having to constantly move pages,
Quicker listing and task management everything remains stationary so the user can easily develope muscle memory when menuevering the website, 
search bar that also has a somewhat pridictive aspect, 
account management like logging out and location saving so checkout is easier, 
safety features from password hashing to user specific item management- only a password who created a listing can delete the listing, 
Loyalty scheme 20% discount after 20 purchases,
Clear item information that allows for traceability likw suppler-lotnumber-and the date it was packed,
stock clearly visible,
order hisotry you can view items that you have purchased in the past,
A stable and recurring theme creting brand identity- semmetric identical box dimension.



The website has helping asseccibility features like a dark them and light theme depending on the user prefference, easy to pick up on screen ques like red text for errors and a simplified gui for appeal and easy use for older customers too.



The backends main job is handling data storage it stores emails, passwords, item information(lotnumber, date of creation...), usernames, cart data etc

backend:
is Express + SQLite via [`node:sqlite`](https://nodejs.org/api/sqlite.html). (Version -- **22.5+** )

optional:
git for easy access if someone needs editing.

Setup:



Installing dependencies:

run npm install,
-cd my-react-app- -npm install-
-cd backend- -npm install-
if there are any issues run -npm audit fix/ audit fix --force



## Website running tools:
Run npm run dev: to start the backend server and the frontend gui:
Shop UI double check the code is hosted at -- `http://localhost:5173`



## Important files in the solution:

src/app.tsx — Handles page navigation/ how the user is redirected after successfull login etc.
src/landing.tsx — The largest files containing the whole of the main page gui its where the page graphical designs are located and where the main page javascript is linked to the html.
src/order_storage.ts — manages all purchasing aspects of the website the cart, purchase, orders and loyalty scheme discount codes.

