import Tile from './Tile.jsx';
import Parenthesis from './Parenthesis.jsx';
import $ from 'jquery';
import Operator from './Operator.jsx';
import EqualsSign from './EqualsSign.jsx';
import Result from './Result.jsx';
import React from 'react';
import Utils from './utils.js';
import {Motion, spring} from 'react-motion';
import range from 'lodash.range';
import ReactDOM from 'react-dom';
import update from 'react-addons-update';
import EventEmitter from 'wolfy87-eventemitter';
import heir from 'heir';
import objectAssign from 'object-assign';

class Game extends React.Component {

  static get TILE_STATES() {
    return {
      STATIC: 'static',
      TRANSITIONING: 'transitioning',
      ACTIVE: 'active',
    }
  }

  constructor(props) {
    super(props);

    /* Default spring physics */
    this.springConfig = {stiffness: 300, damping: 50};

    /* Refs to later access each tile's position */
    this.tileRefs = [];
    this.state = {
      /* An array of 4 numbers */
      numbers: Utils.shuffle(props.puzzle),
      /* An array containing the 4 standard operators as strings */
      /* We shuffle the operators and take the first three to set the initial state of the operators */
      operators: Utils.shuffle(props.operators).slice(0, 3),
      /* An array where the first value represents the position of the left parenthesis, the second the right, and null represents no left/right paren */
      parentheses: [0, 2],
      /* A hash containing various animation-related state data */
      animating: {
        tiles: [],
        /* The X-coordinate location of the cursor, when first clicking the tile. This value is relative to the page (e.g. 346 pixels from the left window border).
           This is subtracted from mouseLocation to determine how much to offset the active tile to draw the active tile under the mouse cursor */
        firstClickLocation: 0,
        /* The X-coordinate location of the cursor, always set to the most updated through onMouseMove handler */
        mouseLocation: 0,
        /* Describes whether the animation has finished before allowing another animation to start
        *  We don't need this property because we have isAnyTileAnimating() which checks the edge offsets to see if they match the original non-animating offsets*/
        //isAnimating: false,
      }
    };
    for (let i = 0; i < this.state.numbers.length; i++) {
      this.state.animating.tiles.push({
        /* Note this is actually set in onTileDownHandler */
        /* The index of the tile before the animation started */
        index: 0,
        /* The target index of the tile after the animation is complete */
        targetIndex: 0,
        /* Describes whether hitting the edge of this tile triggers a swap animation. Is set to false while the tile is already swapping */
        isSwappable: true,
        /* The state of the tile */
        state: Game.TILE_STATES.STATIC,
        /* The target offset the tile should snap to animate to */
        targetOffset: 0,
        isActive: false
      });
      window.isAnimating = this.isAnimating.bind(this);
      window.getStaticTileOffset = this.getStaticTileOffset.bind(this);
      window.getAnimatingTileOffset = this.getAnimatingTileOffset.bind(this);
    }

    /* React's new ES6 class-based components do not have `this` autobinded */
    this.cycleOperator = this.cycleOperator.bind(this);
  }

  componentDidMount() {
    // Enable events for this component
    heir.merge(this, new EventEmitter());
    /* Mouse move and up event listeners must be added outside the React element */

    // touchmove: a finger touches the screen
    window.addEventListener('touchmove', this.onPointerMove.bind(this));
    window.addEventListener('mousemove', this.onPointerMove.bind(this));
    // touchend: a finger is lifted off the screen`
    window.addEventListener('touchend', this.onPointerUp.bind(this));
    // touchcancel: too many fingers on screen, first finger touch canceled
    window.addEventListener('touchcancel', this.onPointerUp.bind(this));
    window.addEventListener('mouseup', this.onPointerUp.bind(this));
  }

  componentWillUnmount() {
    window.removeEventListener('touchmove', this.onPointerMove);
    window.removeEventListener('mousemove', this.onPointerMove);
    window.removeEventListener('touchend', this.onPointerUp);
    window.removeEventListener('touchcancel', this.onPointerUp);
    window.removeEventListener('mouseup', this.onPointerUp);
  }

  componentWillReceiveProps(nextProps) {
    this.emit('gameReset', nextProps);
    this.setState({
      numbers: Utils.shuffle(nextProps.puzzle),
      parentheses: [null, null]
    });
  }

  // Returns a list of possible operators.
  getPossibleOperators() {
    let possibleOperators = this.props.operators;
    return possibleOperators;
  }

  // Returns the index of the current operator.
  getCurrentOperatorIndex(currentOperator) {
    return this.getPossibleOperators().indexOf(currentOperator);
  }

  /**
  * Modifies state {operators} to cycle the operator at the specified index.
  */
  cycleOperator(index, operator) {
    let operatorIndex = this.getCurrentOperatorIndex(operator);
    let numOperators = this.props.operators.length;
    let nextOperatorIndex = (operatorIndex + 1) % numOperators;
    let newOperators = this.state.operators.slice(0);
    newOperators[index] = this.props.operators[nextOperatorIndex];
    this.setState({
      operators: newOperators
    });
  }

  computeResult() {
    let resultString = Utils.buildResultToCompute(this.state.numbers, this.state.operators, this.state.parentheses);
    return JSON.stringify(eval(eval(resultString)));
  }

  getAnimatingTile(index) {
    return this.state.animating.tiles[index];
  }

  getActiveAnimatingTile() {
    let foundTile = null;
    this.state.animating.tiles.forEach((tile, index) => {
      if (tile.isActive) {
        foundTile = tile;
        return;
      }
    });
    return foundTile;
  }

  isActiveTile(index) {
    let tile = this.state.animating.tiles[index];
    return tile && tile.isActive;
  }

  updateAnimatingTile(index, tile) {
    let originalTiles = this.state.animating.tiles;
    let newTiles = originalTiles.slice(0);
    newTiles[index] = tile;
      this.setState(update(this.state, {
      animating: {
        tiles: {$set: newTiles}
      }
    }));
  }
// calcuate based on where mouse's pageX is relative to the known tile offsetLeft (from getTileLeftEdge), these values are unaffected by transform

  findAnimatingTileIndexWithTargetIndex(targetIndex) {
    let foundIndex = -1;
    this.state.animating.tiles.forEach((tile, index) => {
      if (tile.targetIndex == targetIndex) {
        foundIndex = index;
      }
    });
    return foundIndex;
  }

  findAnimatingTileWithTargetIndex(targetIndex) {
    let foundTile = null;
    this.state.animating.tiles.forEach((tile, index) => {
      if (tile.targetIndex == targetIndex) {
        foundTile = tile;
      }
    });
    return foundTile;
  }

  findAnimatingTileWithNonTargetIndex(nonTargetIndex) {
    let foundTile = null;
    this.state.animating.tiles.forEach((tile, index) => {
      if (tile.index == nonTargetIndex) {
        foundTile = tile;
      }
    });
    return foundTile;
  }


  /*
    Called repeatedly by render().
    Calculates whether the edges of the active / neighboring tiles touch based on the current tile layout.
    If overlap is detected, switches the transitioning tile layout.
   */
  updateAnimationState() {
    let activeTile = this.getActiveAnimatingTile();
    if (!activeTile) {
      return;
    }

    let activeTileIndex = activeTile.index;
    let activeTileTargetIndex = activeTile.targetIndex;
    let leftNeighborIndex = this.findAnimatingTileIndexWithTargetIndex(activeTileTargetIndex - 1);
    let rightNeighborIndex = this.findAnimatingTileIndexWithTargetIndex(activeTileTargetIndex + 1);
    //console.warn(`Target Neighbors: ${activeTileTargetIndex - 1}, ${activeTileTargetIndex + 1}`);

    let leftNeighborExists = leftNeighborIndex !== -1;
    let rightNeighborExists = rightNeighborIndex !== -1;

    let leftNeighbor = this.findAnimatingTileWithNonTargetIndex(leftNeighborIndex);
    let rightNeighbor = this.findAnimatingTileWithNonTargetIndex(rightNeighborIndex);

    // Get active, left neighbor, and right neighbor edge offsets
    let { left: activeTileLeftAnimating, right: activeTileRightAnimating } = this.getAnimatingTileOffset(activeTileTargetIndex);
    let { left: activeTargetTileLeftStatic, right: activeTargetTileRightStatic } = this.getStaticTileOffset(activeTileTargetIndex);
    let { left: activeTileLeftStatic, right: activeTileRightStatic } = this.getStaticTileOffset(activeTileIndex);
    let { left: leftNeighborLeftStatic, right: leftNeighborRightStatic } = this.getStaticTileOffset(leftNeighborIndex);
    let { left: rightNeighborLeftStatic, right: rightNeighborRightStatic } = this.getStaticTileOffset(rightNeighborIndex);
    let { left: leftNeighborLeftAnimating, right: leftNeighborRightAnimating } = this.getAnimatingTileOffset(leftNeighborIndex);
    let { left: rightNeighborLeftAnimating, right: rightNeighborRightAnimating } = this.getAnimatingTileOffset(rightNeighborIndex);
    //console.warn(`leftNeighborIndex: ${leftNeighborIndex}`);
    //console.warn(`rightNeighborIndex: ${rightNeighborIndex}`);
    //console.warn(`activeTileRightAnimating: ${activeTileRightAnimating}`);
    //console.warn(`rightNeighborLeftStatic: ${rightNeighborLeftStatic}`);

    //console.log(`rightNeighborExists: ${rightNeighborExists}`);
    //console.log(`activeTileRightAnimating (${activeTileRightAnimating}) > rightNeighborLeftStatic (${rightNeighborLeftStatic}): ${activeTileRightAnimating > rightNeighborLeftStatic}`);
    //console.log(`this.getAnimatingTile(rightNeighborIndex).isSwappable: ${this.getAnimatingTile(rightNeighborIndex).isSwappable}`);

    //console.group();
    //console.log('Active Tile Index:', activeTileIndex);
    //console.log('Active Tile Animating Edge Offsets:', { left: activeTileLeftAnimating, right: activeTileRightAnimating });
    //console.log('Active Tile Static Edge Offsets:', { left: activeTileLeftStatic, right: activeTileRightStatic });
    //console.log('Left Neighbor Static Edge Offsets:', { left: leftNeighborLeftStatic, right: leftNeighborRightStatic });
    //console.log('Right Neighbor Static Edge Offsets:', { left: rightNeighborLeftStatic, right: rightNeighborRightStatic });
    //console.groupEnd();

    // Active tile crossed left neighbor
    if (leftNeighborExists &&
        activeTileLeftAnimating < leftNeighborRightStatic &&
        this.getAnimatingTile(leftNeighborIndex).isSwappable) {
      console.log(`Active tile ${activeTile.number} crossed left neighbor ${leftNeighbor.number}.`);

      let newLeftNeighborTargetIndex = activeTileIndex;
      let newLeftNeighborIsSwappable = false;
      let newLeftNeighborState = Game.TILE_STATES.TRANSITIONING;
      let newLeftNeighborTargetOffset = leftNeighbor.targetOffset + (activeTileLeftStatic - leftNeighborLeftStatic);
      console.info(`newLeftNeighborTargetOffset: ${newLeftNeighborTargetOffset} = activeTileLeftStatic (${activeTileLeftStatic}) - leftNeighborLeftStatic (${leftNeighborLeftStatic}`);

      this.updateAnimatingTile(leftNeighborIndex, objectAssign(leftNeighbor, {
        targetIndex: newLeftNeighborTargetIndex,
        isSwappable: newLeftNeighborIsSwappable,
        state: newLeftNeighborState,
        targetOffset: newLeftNeighborTargetOffset,
        swapState: {
          swappedRightToLeft: false,
          neighborTileIndex: newLeftNeighborTargetIndex,
          activeTileIndex: activeTileTargetIndex
        }
      }));

      let oldLeftNeighborIndex = leftNeighborIndex;
      let oldLeftNeighborOffset = leftNeighborLeftStatic - activeTargetTileLeftStatic;

      this.updateAnimatingTile(activeTileIndex, objectAssign(activeTile, {
        targetIndex: oldLeftNeighborIndex,
        targetOffset: oldLeftNeighborOffset
      }));
    }
    if (rightNeighborExists &&
             activeTileRightAnimating > rightNeighborLeftStatic &&
             this.getAnimatingTile(rightNeighborIndex).isSwappable) {
      console.log(`Active tile ${activeTile.number} crossed right neighbor ${rightNeighbor.number}.`);
      //console.log('Right neighbor:', rightNeighbor);

      let newRightNeighborTargetIndex = activeTileIndex;
      let newRightNeighborIsSwappable = false;
      let newRightNeighborState = Game.TILE_STATES.TRANSITIONING;
      let newRightNeighborTargetOffset = rightNeighbor.targetOffset + (activeTileLeftStatic - rightNeighborLeftStatic);
      console.info(`newRightNeighborTargetOffset: ${newRightNeighborTargetOffset} = activeTileLeftStatic (${activeTileLeftStatic}) - rightNeighborLeftStatic (${rightNeighborLeftStatic}`);

      //console.warn(`(before-update-animation) Right tile at ${rightNeighbor.number} swappable:`, this.getAnimatingTile(rightNeighborIndex).isSwappable);
      this.updateAnimatingTile(rightNeighborIndex, objectAssign(rightNeighbor, {
        targetIndex: newRightNeighborTargetIndex,
        isSwappable: newRightNeighborIsSwappable,
        state: newRightNeighborState,
        targetOffset: newRightNeighborTargetOffset,
        swapState: {
          swappedRightToLeft: true,
          neighborTileIndex: rightNeighborIndex,
          activeTileIndex: activeTileIndex
        }
      }));
      //console.warn(`(after-update-animation) Right tile at ${rightNeighbor.number} swappable:`, this.getAnimatingTile(rightNeighborIndex).isSwappable);

      let oldRightNeighborIndex = rightNeighborIndex;
      let oldRightNeighborOffset = rightNeighborLeftStatic - activeTargetTileLeftStatic;

      this.updateAnimatingTile(activeTileIndex, objectAssign(activeTile, {
        targetIndex: oldRightNeighborIndex,
        targetOffset: oldRightNeighborOffset
      }));
      //console.log('Active Tile Offset:', this.getActiveAnimatingTile()['targetOffset']);
    }
    if (rightNeighborExists) {
      //console.warn(`(post-animation) Right tile at ${rightNeighbor.number} swappable:`, this.getAnimatingTile(rightNeighborIndex).isSwappable);
    }

    this.state.animating.tiles.forEach((neighborTile, neighborTileIndex) => {
      if (!neighborTile.isSwappable) {
        this.allowIsSwappableIfReady(neighborTile.swapState.swappedRightToLeft, neighborTile.swapState.neighborTileIndex, neighborTile.swapState.activeTileIndex);
      }
    });
  }

  allowIsSwappableIfReady(swappedRightToLeft, neighborTileIndex, activeTileIndex) {
    //console.log(`allowIsSwappableIfReady: swappedRightToLeft (${swappedRightToLeft}), neighborTileIndex (${neighborTileIndex}), activeTileIndex (${activeTileIndex})`);
    let neighbor = this.findAnimatingTileWithNonTargetIndex(neighborTileIndex);
    let activeTile = this.getActiveAnimatingTile(activeTileIndex);
    let { left: neighborLeftAnimating, right: neighborRightAnimating } = this.getAnimatingNonTargetTileOffset(neighborTileIndex);
    //console.log(`neighborLeftAnimating (${neighborLeftAnimating}), neighborRightAnimating (${neighborRightAnimating}) for neighbor tile ${neighborTileIndex}`);
    let { left: activeTileLeftAnimating, right: activeTileRightAnimating } = this.getAnimatingNonTargetTileOffset(activeTileIndex);
    //console.log(`activeTileLeftAnimating (${activeTileLeftAnimating}), activeTileRightAnimating (${activeTileRightAnimating}) for active tile ${activeTileIndex}`);
    if (swappedRightToLeft) {
      //console.log(`neighborRightAnimating (${neighborRightAnimating}) < activeTileLeftAnimating (${activeTileLeftAnimating}) = ${neighborRightAnimating < activeTileLeftAnimating}`);
      if (neighborRightAnimating < activeTileLeftAnimating) {
        console.warn('Success! changing isswappable back to true');
        this.updateAnimatingTile(neighborTileIndex, objectAssign(neighbor, {
          isSwappable: true,
          swapState: null
        }));
      }
    } else {
      if (neighborLeftAnimating > activeTileRightAnimating) {
        //console.log(`neighborLeftAnimating (${neighborLeftAnimating}) < activeTileRightAnimating (${activeTileRightAnimating}) = ${neighborLeftAnimating < activeTileRightAnimating}`);
        console.warn('Success! changing isswappable back to true');
        this.updateAnimatingTile(neighborTileIndex, objectAssign(neighbor, {
          isSwappable: true,
          swapState: null
        }));
      }
    }
  }

  /*
    Given the tile index, returns the left and right edge offsets of the tile not affected by transforms.
   */
  getStaticTileOffset(tileIndex) {
    if (tileIndex < 0 || tileIndex > this.tileRefs.length) {
      return {
        left: null,
        right: null
      }
    }
    let inAnimationTileIndex = this.state.animating.tiles[tileIndex].targetIndex;
    let tileRef = this.tileRefs[inAnimationTileIndex];
    if (tileRef) {
      let domNode = ReactDOM.findDOMNode(tileRef);
      return {
        left: domNode.offsetLeft,
        right: domNode.offsetLeft + domNode.offsetWidth
      }
    } else {
      return {
        left: null,
        right: null
      };
    }
  }

  /*
   Given the tile index, returns the accurate-as-displayed left and right edge offsets from the left of the viewport.
   The tiles checked are not the original tiles, but the temporary in-animation tiles number layout.
   */
  getAnimatingTileOffset(tileIndex) {
    if (tileIndex < 0 || tileIndex > this.tileRefs.length) {
      return {
        left: null,
        right: null
      }
    }
    let inAnimationTileIndex = this.state.animating.tiles[tileIndex].targetIndex;
    let tileRef = this.tileRefs[inAnimationTileIndex];
    if (tileRef) {
      let domNode = ReactDOM.findDOMNode(tileRef);
      let rect = domNode.getBoundingClientRect();
      return {
        left: rect.left,
        right: rect.left + rect.width
      }
    } else {
      return {
        left: null,
        right: null
      };
    }
  }

  /*
   Given the tile index, returns the accurate-as-displayed left and right edge offsets from the left of the viewport.
   The tiles checked are not the original tiles, but the temporary in-animation tiles number layout.
   */
  getAnimatingNonTargetTileOffset(tileIndex) {
    if (tileIndex < 0 || tileIndex > this.tileRefs.length) {
      return {
        left: null,
        right: null
      }
    }
    let tileRef = this.tileRefs[tileIndex];
    if (tileRef) {
      let domNode = ReactDOM.findDOMNode(tileRef);
      let rect = domNode.getBoundingClientRect();
      return {
        left: rect.left,
        right: rect.left + rect.width
      }
    } else {
      return {
        left: null,
        right: null
      };
    }
  }

  isAnimating() {
    let originalTileOffsets = [];
    // Check whether each tile has a CSS transform translate3d property that isn't 0
    for (let i = 0; i < this.tileRefs.length; i++) {
      let tileRef = this.tileRefs[i];
      if (tileRef) {
        let domNode = ReactDOM.findDOMNode(tileRef);
        let transformStyle = domNode.style.transform;
        // Get "1px, 0px, 0px" from "transform3d(1px, 0px, 0px) scale(1.1)"
        transformStyle = transformStyle.substring(transformStyle.indexOf('(') + 1, transformStyle.indexOf(')'));
        // Get "1px,0px,0px" from "1px, 0px, 0px"
        transformStyle = transformStyle.replace(/ /g, '');
        // Get "1,0,0" from "1px,0px,0px"
        transformStyle = transformStyle.replace(/px/g, '');
        // Get the first number
        let transformXOffset = Number(transformStyle.split(',')[0])
        if (transformXOffset !== 0) {
          return true;
        }
      } else {
        return false;
      }
    }
    // Check that the mouse isn't down
    this.state.animating.tiles.forEach((tile, index) => {
      if (tile.isActive) {
        return true;
      }
    });
    return false;
  }

  /*
    Returns true if the tile's left offset matches any of the pre-transform left offsets.
   */
  isTileTransitioning(tileIndex) {
    let originalTileOffsets = [];
    for (let i = 0; i < this.tileRefs.length; i++) {
      originalTileOffsets.push(this.getStaticTileOffset(i)['left']);
    }
    let activeLeftOffset = this.getAnimatingTileOffset(tileIndex)['left'];
    return originalTileOffsets.indexOf(activeLeftOffset) == -1;
  }

  /**
   * Occurs when the mouse pointer or finger selects the tile.
   * @param tileIndex The index of the tile that was selected.
   * @param pageX
   */
  onTileDownHandler(tileIndex, {pageX: mouseLocation}) {
    console.log(`Calling %conTileDownHandler(tileIndex: ${tileIndex}, mouseLocation: ${mouseLocation}).`, Utils.getConsoleStyle('code'));

    // TODO: Wait for the tiles to drift back and finish animating (stop moving) before allowing another animation to take place
    if (this.isAnimating()) {
      return;
    }

    let tiles = [];
    this.state.numbers.forEach((number, index) => {
      if (tileIndex == index) {
        tiles.push({
          index: index,
          number: number,
          targetIndex: index,
          isSwappable: true,
          state: Game.TILE_STATES.STATIC,
          targetOffset: 0,
          isActive: true
        })
      } else {
        tiles.push({
          index: index,
          number: number,
          targetIndex: index,
          isSwappable: true,
          state: Game.TILE_STATES.STATIC,
          targetOffset: 0
        });
      }
    });
    this.setState(update(this.state, {
      animating: {
        firstClickLocation: {$set: mouseLocation},
        mouseLocation: {$set: mouseLocation},
        tiles: { $set: tiles },
      }
    }));
  }

  /**
   * Occurs when the mouse pointer or finger moves across the page.
   * @param pageX The cursor's current location relative to the page.
   */
  onPointerMove({pageX}) {
    //console.log(`Calling %conPointerMove(pageX: ${pageX}}).`, Utils.getConsoleStyle('code'));
    // Update the state with the current cursor's location to be used when rendering the active tile later
    this.setState(update(this.state, {
      animating: {
        mouseLocation: {$set: pageX}
      }
    }));
  }

  onPointerUp(e) {
    console.log(`Calling %conPointerUp(event: ${e}}).`, Utils.getConsoleStyle('code'));
    // TODO: Do not wait for animation to complete, use targetIndex to pre-emptively swap the tiles in a temp place and calculate the result to make the game seem faster
    //       In other words, the result should update immediately after the user releases their cursor and should not wait for the animation to finish
    let activeTile = this.getActiveAnimatingTile();
    activeTile.isActive = false;
    this.updateAnimatingTile(activeTile.index, activeTile)
  }

  getTileZIndex(renderingTileIndex) {
    // If the current tile being rendered is held down and moved, or mouse was released and last held tile is moving back to original position
    if (this.isActiveTile(renderingTileIndex)) {
      return 99999;
    } else {
      return 100;
    }
  }

  getTileHtml(tileIndex) {
    let tileValue = this.state.numbers[tileIndex];
    let tileStyle = this.getTileMotionStyle(tileIndex);
    let html =
      <Motion style={tileStyle} key={tileIndex}>
        {({scale, shadow, offsetX}) => {
          //console.log(`Tile ${tileIndex}: Offset ${offsetX}px.`);
          return <Tile onMouseDownHandler={this.onTileDownHandler.bind(this, tileIndex)}
                onTouchStartHandler={this.onTileDownHandler.bind(this, tileIndex)}
                value={tileValue} ref={(ref) => this.tileRefs[tileIndex] = ref}
                customStyles={{
                  boxShadow: `rgba(0, 0, 0, 0.2) 0px ${shadow}px ${2 * shadow}px 0px`,
                  transform: `translate3d(${offsetX}px, 0, 0) scale(${scale})`,
                  zIndex: this.getTileZIndex(tileIndex),
                }}/>;
        }}
      </Motion>;
    return html;
  }

  getTileMotionStyle(tileIndex) {
    let { firstClickLocation, mouseLocation } = this.state.animating;
    //console.log(`Calling %cgetTileMotionStyle(numIndexPressed: ${numIndexPressed}), mouseLocation: ${mouseLocation}.`, Utils.getConsoleStyle('code'));
    let inactiveTileOffset = 0;
    let animatingTile = this.state.animating.tiles[tileIndex];
    if (animatingTile) {
      inactiveTileOffset = animatingTile.targetOffset;
    }
    if (this.isActiveTile(tileIndex)) {
      return {
        scale: spring(1.1, this.springConfig),
        shadow: spring(16, this.springConfig),
        offsetX: mouseLocation - firstClickLocation,
      };
    } else {
      return {
        scale: spring(1, this.springConfig),
        shadow: spring(1, this.springConfig),
        offsetX: spring(inactiveTileOffset, this.springConfig),
      };
    }
  }

  getOperatorHtml(index) {
    let numNumbers = this.state.numbers.length;
    if (index == numNumbers - 1)
      return;

    return <Operator
      index={index}
      operator={this.state.operators[index]}
      possibleOperators={this.props.operators}
      cycleOperatorFn={this.cycleOperator}
      />;
  }

  getParensHtml(direction, index) {
    let parensIndex = this.state.parentheses[direction == 'left' ? 0 : 1];
    if (parensIndex == index) {
      return <Parenthesis
        index={parensIndex}
        type={direction}
        />;
    }
  }

  /**
   * Occurs after render() is called. Called by React.
   */
  componentDidUpdate(prevProps, prevState){
    if (this.isAnimating()) {
      this.updateAnimationState();
    }
  }

  render() {
    let result = this.computeResult();

    return (
      <section className="flexible rows horizontally-centered vertically-centered game">
        {/* Do this 4 times .. */}
        { range(this.state.numbers.length).map( index => {
          return [
            // Render left parenthesis
            this.getParensHtml('left', index),
            // Render number tile
            this.getTileHtml(index),
            // Render right parenthesis
            this.getParensHtml('right', index),
            // Render operator
            this.getOperatorHtml(index),
          ];
        })}
        <EqualsSign/>
        <Result value={Utils.cleanComputedResult(result)}/>
      </section>
    );
  }
}

Game.propTypes = {
  /* An array of 4 numbers */
  puzzle: React.PropTypes.array.isRequired,
  /* An array containing the allowed mathematical operators */
  operators: React.PropTypes.array.isRequired
};

export default Game;
